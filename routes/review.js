const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();

function normalizeQuestion(q) {
  return String(q || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function sanitizeChoices(choices) {
  if (!Array.isArray(choices)) return [];
  return choices.map((c) => String(c).trim()).filter(Boolean);
}

router.get("/", async (req, res) => {
  const list = await readJSON("reviewproblems", []);
  const { subject } = req.query;
  if (subject) {
    return res.json(list.filter((p) => p.subject === subject));
  }
  res.json(list);
});

router.get("/subjects", async (req, res) => {
  const list = await readJSON("reviewproblems", []);
  const subjects = [...new Set(list.map((p) => p.subject).filter(Boolean))];
  res.json(subjects);
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

  const list = await readJSON("reviewproblems", []);
  const dupKey = normalizeQuestion(question);
  const existing = list.find((p) => normalizeQuestion(p.question) === dupKey);
  if (existing) {
    return res.status(200).json({ ...existing, duplicate: true });
  }

  const item = {
    id: crypto.randomUUID(),
    subject: (req.body.subject || "").trim(),
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
  await writeJSON("reviewproblems", list);
  res.status(201).json(item);
});

router.post("/:id/attempt", async (req, res) => {
  const list = await readJSON("reviewproblems", []);
  const idx = list.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });

  const correct = Boolean(req.body.correct);
  const item = list[idx];
  item.stats = item.stats || { correct: 0, wrong: 0, lastResult: null, lastAttemptAt: null };
  if (correct) item.stats.correct += 1;
  else item.stats.wrong += 1;
  item.stats.lastResult = correct;
  item.stats.lastAttemptAt = new Date().toISOString();

  await writeJSON("reviewproblems", list);
  res.json(item);
});

router.delete("/:id", async (req, res) => {
  const list = await readJSON("reviewproblems", []);
  const idx = list.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "not found" });
  const [removed] = list.splice(idx, 1);
  await writeJSON("reviewproblems", list);
  res.json(removed);
});

module.exports = router;
