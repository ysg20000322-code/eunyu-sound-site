const express = require("express");
const crypto = require("crypto");
const Anthropic = require("@anthropic-ai/sdk");
const { readJSON, writeJSON, seedIfMissing } = require("../lib/store");

const router = express.Router();

const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    source: { type: "string" },
    question: { type: "string" },
    context: { type: "string" },
    choices: { type: "array", items: { type: "string" } },
    answerIndex: { type: "integer" },
    explanation: { type: "string" },
  },
  required: ["source", "question", "context", "choices", "answerIndex", "explanation"],
  additionalProperties: false,
};

const EXTRACT_PROMPT = `이 이미지는 시험 오답노트 스크린샷입니다. 다음 정보를 읽어서 JSON으로 추출해주세요:
- source: 문제 출처 (예: "2021년 09월 12일 기출문제 94번"). 없으면 빈 문자열.
- question: 문제 지문 전체 (선택지 제외).
- context: 문제에 딸린 표나 추가 조건/보기 텍스트. 없으면 빈 문자열.
- choices: 선택지 목록 (번호(1,2,3...)는 제외한 내용만, 배열).
- answerIndex: 정답 선택지의 0부터 시작하는 인덱스. 이미지에 정답 표시가 없으면 -1.
- explanation: 해설 텍스트. 없으면 빈 문자열.
choices 배열의 순서와 answerIndex가 정확히 일치해야 합니다.`;

const SEED = [
  {
    id: "seed-1",
    source: "2021년 09월 12일 기출문제 94번",
    question:
      "100ha의 배수면적인 지역에 강우강도 50mm/hr의 비가 내렸을 때 우수유출량(m3/sec)은?",
    context:
      "배수면적 토지이용: 잔디(30ha), 숲(50ha), 아스팔트포장(20ha)\n유출계수: 잔디(0.20), 숲(0.15), 아스팔트 포장(0.90)",
    choices: ["4.375", "5.792", "6.474", "7.583"],
    answerIndex: 0,
    explanation:
      "1ha = 10,000m². 각 ha 수 × 10,000 × 유출계수 × 0.05 = 1시간당 우수 유출량. 이후 1hr에서 1sec으로 바꿔야 하므로 /60 /60 두 번 진행.\n(30×10,000×0.20 + 50×10,000×0.15 + 20×10,000×0.90) × 0.05 / 3,600 = 4.375",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
];

seedIfMissing("wrongnotes", SEED).catch((err) => console.error("[wrongnotes] seed failed:", err));

function sanitizeChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map((c) => String(c).trim()).filter(Boolean);
}

router.get("/", async (req, res) => {
  const list = await readJSON("wrongnotes", []);
  res.json(list);
});

router.post("/", async (req, res) => {
  const question = (req.body.question || "").trim();
  const choices = sanitizeChoices(req.body.choices);
  const answerIndex = Number(req.body.answerIndex);

  if (!question) return res.status(400).json({ error: "question is required" });
  if (choices.length < 2) return res.status(400).json({ error: "at least 2 choices are required" });
  if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) {
    return res.status(400).json({ error: "answerIndex must point to a valid choice" });
  }

  const list = await readJSON("wrongnotes", []);
  const item = {
    id: crypto.randomUUID(),
    source: (req.body.source || "").trim(),
    question,
    context: (req.body.context || "").trim(),
    choices,
    answerIndex,
    explanation: (req.body.explanation || "").trim(),
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  };
  list.push(item);
  await writeJSON("wrongnotes", list);
  res.status(201).json(item);
});

router.post("/extract", async (req, res) => {
  const { imageBase64, mediaType } = req.body;
  if (!imageBase64) return res.status(400).json({ error: "imageBase64 is required" });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: "ANTHROPIC_API_KEY가 설정되지 않았어요. Vercel 프로젝트 환경 변수에 추가해주세요.",
    });
  }

  try {
    const anthropic = new Anthropic();
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      thinking: { type: "disabled" },
      output_config: { format: { type: "json_schema", schema: EXTRACT_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: imageBase64,
              },
            },
            { type: "text", text: EXTRACT_PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) throw new Error("no text block in response");
    res.json(JSON.parse(textBlock.text));
  } catch (err) {
    console.error("[wrongnotes] extract failed:", err);
    res.status(502).json({ error: "이미지 인식에 실패했어요. 다시 시도하거나 직접 입력해주세요." });
  }
});

router.post("/:id/attempt", async (req, res) => {
  const list = await readJSON("wrongnotes", []);
  const idx = list.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });

  const correct = Boolean(req.body.correct);
  const item = list[idx];
  item.stats = item.stats || { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null };
  if (correct) item.stats.correct += 1;
  else item.stats.wrong += 1;
  item.stats.lastResult = correct;
  item.stats.lastAttemptAt = new Date().toISOString();

  await writeJSON("wrongnotes", list);
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  const list = await readJSON("wrongnotes", []);
  const idx = list.findIndex((n) => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const [removed] = list.splice(idx, 1);
  await writeJSON("wrongnotes", list);
  res.json(removed);
});

module.exports = router;
