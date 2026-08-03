const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON, mergeSeed } = require("../lib/store");

const router = express.Router();

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

function normalizeQuestion(q) {
  return String(q || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function dedupeByQuestion(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = normalizeQuestion(item.question);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function seedAndDedupe() {
  await mergeSeed("wrongnotes", SEED);
  const list = await readJSON("wrongnotes", []);
  const deduped = dedupeByQuestion(list);
  if (deduped.length !== list.length) await writeJSON("wrongnotes", deduped);
}

seedAndDedupe().catch((err) => console.error("[wrongnotes] seed/dedupe failed:", err));

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
  const dupKey = normalizeQuestion(question);
  const existing = list.find((n) => normalizeQuestion(n.question) === dupKey);
  if (existing) {
    return res.status(200).json({ ...existing, duplicate: true });
  }

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
