const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON, seedIfMissing } = require("../lib/store");

const router = express.Router();

const SEED = [
  {
    id: "seed-1",
    name: "발표토론 연합동아리",
    period: "2023",
    role: "회장",
    detail: "",
    record: "",
    note: "구체적 활동 내용, 성과 추가 입력 필요",
  },
  {
    id: "seed-2",
    name: "교내 동아리",
    period: "2023",
    role: "관리부장",
    detail: "",
    record: "",
    note: "동아리명, 활동 내용 추가 입력 필요",
  },
  {
    id: "seed-3",
    name: "목표달성동아리(똑집)",
    period: "2026~",
    role: "신입 운영진 → 회장",
    detail: "정기모임/임원진회의/정모/MT/OT 운영, 카페일지 체크 및 리뷰 관리",
    record: "카카오톡 단체방, 캘린더 일정 기록",
    note: "캘린더 기준 가장 활발히 지속 중인 활동",
  },
  {
    id: "seed-4",
    name: "국토대장정",
    period: "2026-05-29 ~ 2026-07-01",
    role: "참여자",
    detail: "약 5주간 도보 대장정 참여",
    record: "캘린더 일정(김포공항 국내선 등)",
    note: "이동 경로/소감 등 기록 있으면 추가",
  },
];

seedIfMissing("activities", SEED).catch((err) => console.error("[activities] seed failed:", err));

router.get("/", async (req, res) => {
  res.json(await readJSON("activities", []));
});

router.post("/", async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: "name is required" });
  const list = await readJSON("activities", []);
  const item = {
    id: crypto.randomUUID(),
    name: name.trim(),
    period: req.body.period || "",
    role: req.body.role || "",
    detail: req.body.detail || "",
    record: req.body.record || "",
    note: req.body.note || "",
  };
  list.push(item);
  await writeJSON("activities", list);
  res.status(201).json(item);
});

router.put("/:id", async (req, res) => {
  const list = await readJSON("activities", []);
  const idx = list.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  list[idx] = { ...list[idx], ...req.body, id: list[idx].id };
  await writeJSON("activities", list);
  res.json(list[idx]);
});

router.delete("/:id", async (req, res) => {
  const list = await readJSON("activities", []);
  const idx = list.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const [removed] = list.splice(idx, 1);
  await writeJSON("activities", list);
  res.json(removed);
});

module.exports = router;
