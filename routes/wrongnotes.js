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
  {
    id: "seed-2",
    source: "2021년 09월 12일 기출문제 46번",
    question: "조경설계기준상 게이트볼장의 설계와 관련된 내용중 거리가 먼 것은?",
    context: "",
    choices: [
      "경기라인 밖으로 2m의 규제라인을 긋는다.",
      "라인이란 경계를 표시한 실선의 바깥쪽을 말한다.",
      "게이트는 코트 안의 세 곳에 설치하되 높이는 지면에서 20cm로 한다.",
      "코트의 면은 평활하고 균일한 면을 가지고 있어야 하나, 옥외코트는 0.5%까지의 기울기를 둔다.",
    ],
    answerIndex: 0,
    explanation:
      "경기장 밖으로 1m 규제라인. 경기장 규격은 세로 20m 가로25 또는 세로15m 가로20m.",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-3",
    source: "2021년 09월 12일 기출문제 40번",
    question:
      "도시계획시설로 분류되지 않는 것은? (단, 도시·군계획시설의 결정·구조 및 설치기준에 관한 규칙을 적용한다.)",
    context: "",
    choices: ["교통시설", "방재시설", "주거시설", "공공·문화체육시설"],
    answerIndex: 2,
    explanation:
      "도시계획시설: 1.교통시설 2.공간시설 3.유통 및 공급시설 4.공공·문화체육시설 5.방재시설 6.보건위생시설 7.환경기초시설 (주거시설은 해당 없음)",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-4",
    source: "2021년 09월 12일 기출문제 56번",
    question: "A2(420×594) 제도 용지 도면을 묶지 않을 경우 도면에 테두리의 여백은 최소 얼마나 두어야 하는가?",
    context: "",
    choices: ["5mm", "10mm", "15mm", "20mm"],
    answerIndex: 1,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-5",
    source: "2021년 09월 12일 기출문제 57번",
    question: "색의 3속성을 나타내는 색입체 표현이 옳은 그림은? (각 보기는 색상·명도·채도 세 축의 배치가 다른 타원형 색입체 도식)",
    context:
      "타원형 색입체 그림에서 세로축, 타원 상단 라벨, 가로축(채도 화살표)에 색상·명도·채도를 각각 어떻게 배치했는지를 비교하는 문제.",
    choices: [
      "세로축 색상 / 상단 명도 / 가로축 채도",
      "세로축 색상 / 상단 채도 / 가로축 명도",
      "세로축 채도 / 상단 명도 / 가로축 색상",
      "세로축 명도 / 상단 색상 / 가로축 채도",
    ],
    answerIndex: 3,
    explanation:
      "색입체는 명도를 세로축(수직)으로, 색상을 원주(둘레) 방향으로, 채도를 중심에서 바깥으로 방사형으로 배치한다.",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-6",
    source: "2021년 09월 12일 기출문제 32번",
    question:
      "「도시공원 및 녹지 등에 관한 법률」상 도시공원 안에 설치할 수 있는 공원시설의 부지면적은 당해 도시공원의 면적에 대한 비율로 규정하고 있는데 그 기준이 틀린 것은?",
    context: "",
    choices: ["어린이 공원 : 100분의 60이하", "근린공원 : 100분의 30이하", "묘지공원 : 100분의 20이상", "체육공원 : 100분의 50이하"],
    answerIndex: 1,
    explanation:
      "어린이공원 100분의 60, 체육공원 100분의 50, 근린공원 100분의 40, 수변공원 100분의 40, 도시농업공원 100분의 40, 묘지공원 100분의 20.",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-7",
    source: "2021년 09월 12일 기출문제 75번",
    question: "다음 중 수도(數度, abundance)를 나타내는 식으로 옳은 것은?",
    context: "",
    choices: [
      "조사한 총 면적 / 어떤 종의 총 개체수",
      "어떤 종이 출현한 방형구 / 조사한 총 방형구 수",
      "어떤 종의 총 개체수 / 조사한 총 면적",
      "어떤 종의 총 개체수 / 어떤 종이 출현한 방형구 수",
    ],
    answerIndex: 3,
    explanation:
      "수도란 특정 종의 개체수가 얼마나 자주 등장하는지, 즉 해당 종이 조사한 구역에서 얼마나 자주 발견되는지를 나타냄. 방형구: 넓은 지역의 분포를 연구하기 위해 표준 면적단위로 설정하는 구획(틀).",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-8",
    source: "2021년 09월 12일 기출문제 84번",
    question: "적산 시 적용하는 품셈의 금액의 단위 표준에 관한 내용으로 잘못 표기된 것은?",
    context: "",
    choices: [
      "'설계서의 총액'은 1000원 이하는 버린다.",
      "'설계서의 소계'는 100원 이하는 버린다.",
      "'설계서의 금액란'에서는 1원 미만은 버린다.",
      "'일위대가표의 금액란'은 0.1원 미만은 버린다.",
    ],
    answerIndex: 1,
    explanation:
      "설계의 총액 1000원 이하 버림. 설계서의 소계/설계서의 금액란/일위대가표 계금은 1원 미만 버림. 일위대가표 금액란은 0.1원 미만 버림.",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-9",
    source: "2021년 09월 12일 기출문제 82번",
    question: "다음 그림의 면적을 심프슨(simpson) 제1법칙을 이용하여 구하면 얼마인가?",
    context:
      "간격 2.0m로 등분된 7개 지점의 폭(y1~y7): 2.6, 3.0, 2.8, 2.4, 2.2, 1.8, 2.0",
    choices: ["28.93m²", "29.00m²", "29.10m²", "29.17m²"],
    answerIndex: 0,
    explanation:
      "심프슨 제1법칙: h/3{y1 + 4(y2+y4+y6) + 2(y3+y5) + y7} (조건: 짝수 등분)\nh=2, y1=2.6, y7=2.0, 짝수항(y2,y4,y6)=3.0,2.4,1.8, 홀수항(y3,y5)=2.8,2.2\n= 2/3 × {4.6 + 4×7.2 + 2×5.0} = 2/3 × 43.4 ≒ 28.93m²",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-10",
    source: "2021년 09월 12일 기출문제 85번",
    question: "원형지하 배수관의 굵기를 결정하기 위한 평균 유속(流速) 산출 공식은?",
    context: "V = 평균유속, C = 평균유속계수, R = 경심, I = 수면경사",
    choices: ["V = CRI", "V = √CRI", "V = √RI / C", "V = C√RI"],
    answerIndex: 3,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-11",
    source: "2021년 09월 12일 기출문제 93번",
    question: "시방서에 대한 설명 중 옳지 않은 것은?",
    context: "",
    choices: [
      "공사 수량 산출서",
      "공사시행 관계 내용 기록 서류",
      "재료, 공법을 정확하게 지시하고 도면과 상이하지 않게 기록",
      "시방서의 종류에는 공사시방서, 전문시방서, 표준시방서가 있음",
    ],
    answerIndex: 0,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-12",
    source: "2021년 09월 12일 기출문제 86번",
    question: "공사발주를 위해 발주자가 작성하는 서류가 아닌 것은?",
    context: "",
    choices: ["수량산출서", "내역서", "시방서", "견적서"],
    answerIndex: 3,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-13",
    source: "2021년 09월 12일 기출문제 96번",
    question: "도로의 단곡선을 설치할 때 곡선의 시점(B.C) 위치를 구하기 위해서 필요한 요소가 아닌 것은?",
    context: "",
    choices: ["반경(R)", "접선장(T.L)", "곡선장(C.L)", "교점(IP)까지의 추가거리"],
    answerIndex: 2,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-14",
    source: "2021년 09월 12일 기출문제 95번",
    question:
      "옹벽이 횡방향의 압력으로 반시계 방향으로 회전하거나 벽체의 외측으로 움직일 때 뒤채움 흙은 팽창할 것이다. 이 팽창이 증가하여 파괴가 일어날 때의 토압을 무엇이라 하는가?",
    context: "",
    choices: ["주동토압", "이동토압", "수동토압", "정지토압"],
    answerIndex: 0,
    explanation:
      "주동토압: 흙이 팽창하면서 파괴될 때의 토압. 수동토압: 흙이 압축되면서 파괴될 때의 토압. 정지토압: 구조물의 수평변위 없이 흙이 파괴될 때의 토압.",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-15",
    source: "기출문제 91번",
    question: "다음 중 점토의 특성으로 옳지 않은 것은?",
    context: "",
    choices: [
      "주성분은 규산 50~70%, 알루미나 15~35%, 기타 MgO, K2O, Na2O3가 포함되어 있다.",
      "암석이 풍화된 세립(細粒)으로 습한상태에서 소성이 크다.",
      "비중은 3.0~3.5정도이고 알루미나 성분이 많은 점토의 비중은 3.0 내외이다.",
      "양질의 점토일수록 가소성이 좋다.",
    ],
    answerIndex: 0,
    explanation: "",
    createdAt: new Date().toISOString(),
    stats: { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null },
  },
  {
    id: "seed-16",
    source: "기출문제 57번",
    question: "다음 그림과 같이 투상하는 방법은?",
    context:
      "정면도를 중심으로 위에 저면도, 아래에 평면도, 좌우에 좌측면도·우측면도를 배치한 정투상도 배열 그림.",
    choices: ["제1각법", "제2각법", "제3각법", "제4각법"],
    answerIndex: 0,
    explanation: "",
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
