const express = require("express");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get("/", async (req, res) => {
  res.json(await readJSON("checkins", {}));
});

router.get("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const data = await readJSON("checkins", {});
  res.json(data[req.params.date] || null);
});

router.post("/:date", async (req, res) => {
  if (!DATE_RE.test(req.params.date)) {
    return res.status(400).json({ error: "date must be YYYY-MM-DD" });
  }
  const data = await readJSON("checkins", {});
  data[req.params.date] = { ...(data[req.params.date] || {}), ...req.body };
  await writeJSON("checkins", data);
  res.json(data[req.params.date]);
});

module.exports = router;
