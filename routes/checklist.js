const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(req, res) {
  if (!DATE_RE.test(req.params.date)) {
    res.status(400).json({ error: "date must be YYYY-MM-DD" });
    return false;
  }
  return true;
}

router.get("/:date", async (req, res) => {
  if (!assertDate(req, res)) return;
  const all = await readJSON("checklist", {});
  res.json(all[req.params.date] || []);
});

router.post("/:date", async (req, res) => {
  if (!assertDate(req, res)) return;
  const text = (req.body.text || "").trim();
  if (!text) return res.status(400).json({ error: "text is required" });

  const all = await readJSON("checklist", {});
  if (!all[req.params.date]) all[req.params.date] = [];
  all[req.params.date].push({ id: crypto.randomUUID(), text, done: false });
  await writeJSON("checklist", all);
  res.status(201).json(all[req.params.date]);
});

router.patch("/:date/:itemId", async (req, res) => {
  if (!assertDate(req, res)) return;
  const all = await readJSON("checklist", {});
  const list = all[req.params.date] || [];
  const item = list.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: "item not found" });
  if (typeof req.body.done === "boolean") item.done = req.body.done;
  if (typeof req.body.text === "string" && req.body.text.trim()) item.text = req.body.text.trim();
  await writeJSON("checklist", all);
  res.json(list);
});

router.delete("/:date/:itemId", async (req, res) => {
  if (!assertDate(req, res)) return;
  const all = await readJSON("checklist", {});
  const list = all[req.params.date] || [];
  const idx = list.findIndex((i) => i.id === req.params.itemId);
  if (idx === -1) return res.status(404).json({ error: "item not found" });
  list.splice(idx, 1);
  if (list.length === 0) delete all[req.params.date];
  else all[req.params.date] = list;
  await writeJSON("checklist", all);
  res.json(all[req.params.date] || []);
});

module.exports = router;
