const express = require("express");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", async (req, res) => {
  res.json(await readJSON("diary", {}));
});

router.get("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const all = await readJSON("diary", {});
  res.json(all[req.params.date] || null);
});

router.post("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const text = (req.body.text || "").trim();
  const all = await readJSON("diary", {});
  if (!text) {
    delete all[req.params.date];
    await writeJSON("diary", all);
    return res.json(null);
  }
  all[req.params.date] = { text, updatedAt: new Date().toISOString() };
  await writeJSON("diary", all);
  res.json(all[req.params.date]);
});

module.exports = router;
