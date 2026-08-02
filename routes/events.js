const express = require("express");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

router.get("/", async (req, res) => {
  const all = await readJSON("events", {});
  const { month } = req.query;
  if (month) {
    if (!MONTH_RE.test(month)) return res.status(400).json({ error: "month must be YYYY-MM" });
    const filtered = {};
    for (const date of Object.keys(all)) {
      if (date.startsWith(month)) filtered[date] = all[date];
    }
    return res.json(filtered);
  }
  res.json(all);
});

router.get("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const all = await readJSON("events", {});
  res.json(all[req.params.date] || []);
});

router.post("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const title = (req.body.title || "").trim();
  if (!title) return res.status(400).json({ error: "title is required" });
  const time = (req.body.time || "").trim();

  const all = await readJSON("events", {});
  if (!all[req.params.date]) all[req.params.date] = [];
  all[req.params.date].push({ title, time });
  all[req.params.date].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  await writeJSON("events", all);
  res.json(all[req.params.date]);
});

router.delete("/:date/:index", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const idx = Number(req.params.index);
  const all = await readJSON("events", {});
  const list = all[req.params.date] || [];
  if (!Number.isInteger(idx) || idx < 0 || idx >= list.length) {
    return res.status(404).json({ error: "event not found" });
  }
  list.splice(idx, 1);
  if (list.length === 0) delete all[req.params.date];
  else all[req.params.date] = list;
  await writeJSON("events", all);
  res.json(all[req.params.date] || []);
});

module.exports = router;
