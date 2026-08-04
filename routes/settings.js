const express = require("express");
const { readJSON, writeJSON } = require("../lib/store");

const router = express.Router();

const DEFAULT_SETTINGS = {
  enabledModules: { calendar: true, diary: true, history: true, wrongnotes: true },
};

router.get("/", async (req, res) => {
  const settings = await readJSON("settings", DEFAULT_SETTINGS);
  res.json(settings);
});

router.put("/", async (req, res) => {
  const enabledModules = req.body.enabledModules;
  if (!enabledModules || typeof enabledModules !== "object") {
    return res.status(400).json({ error: "enabledModules object is required" });
  }
  const settings = { enabledModules };
  await writeJSON("settings", settings);
  res.json(settings);
});

module.exports = router;
