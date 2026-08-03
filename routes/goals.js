const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON } = require("../lib/store");
const { normalizeGoal } = require("../lib/goalSchema");

const router = express.Router();

router.get("/", async (req, res) => {
  res.json(normalizeGoal(await readJSON("goals", null)));
});

router.put("/", async (req, res) => {
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });

  const goal = {
    id: crypto.randomUUID(),
    title,
    targetDate: req.body.targetDate || null,
    note: req.body.note || "",
    milestones: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  await writeJSON("goals", goal);
  res.status(201).json(goal);
});

const BEHAVIOR_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

router.patch("/", async (req, res) => {
  const goal = normalizeGoal(await readJSON("goals", null));
  if (!goal) return res.status(404).json({ error: "no goal set" });

  if (typeof req.body.title === "string" && req.body.title.trim()) goal.title = req.body.title.trim();
  if ("targetDate" in req.body) goal.targetDate = req.body.targetDate || null;
  if (typeof req.body.note === "string") goal.note = req.body.note;
  if ("completed" in req.body) goal.completedAt = req.body.completed ? new Date().toISOString() : null;

  if (req.body.behavior && typeof req.body.behavior === "object") {
    const b = req.body.behavior;
    if ("time" in b && b.time !== null && !BEHAVIOR_TIME_RE.test(b.time)) {
      return res.status(400).json({ error: "behavior.time must be HH:mm" });
    }
    goal.behavior = { ...goal.behavior, ...b };
  }

  await writeJSON("goals", goal);
  res.json(goal);
});

router.delete("/", async (req, res) => {
  await writeJSON("goals", null);
  res.status(204).end();
});

router.post("/milestones", async (req, res) => {
  const goal = await readJSON("goals", null);
  if (!goal) return res.status(404).json({ error: "no goal set" });
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  goal.milestones.push({ id: crypto.randomUUID(), text, done: false });
  await writeJSON("goals", goal);
  res.status(201).json(goal);
});

router.patch("/milestones/:id", async (req, res) => {
  const goal = await readJSON("goals", null);
  if (!goal) return res.status(404).json({ error: "no goal set" });
  const milestone = goal.milestones.find((m) => m.id === req.params.id);
  if (!milestone) return res.status(404).json({ error: "milestone not found" });

  if (typeof req.body.done === "boolean") milestone.done = req.body.done;
  if (typeof req.body.text === "string" && req.body.text.trim()) milestone.text = req.body.text.trim();

  await writeJSON("goals", goal);
  res.json(goal);
});

router.delete("/milestones/:id", async (req, res) => {
  const goal = await readJSON("goals", null);
  if (!goal) return res.status(404).json({ error: "no goal set" });
  const idx = goal.milestones.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "milestone not found" });

  goal.milestones.splice(idx, 1);
  await writeJSON("goals", goal);
  res.json(goal);
});

module.exports = router;
