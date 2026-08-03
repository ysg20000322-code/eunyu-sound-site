const express = require("express");
const path = require("path");

const checkinsRouter = require("../routes/checkins");
const eventsRouter = require("../routes/events");
const activitiesRouter = require("../routes/activities");
const checklistRouter = require("../routes/checklist");
const diaryRouter = require("../routes/diary");
const wrongnotesRouter = require("../routes/wrongnotes");
const settingsRouter = require("../routes/settings");
const goalsRouter = require("../routes/goals");
const authRouter = require("../routes/auth");
const { isAuthenticated } = require("../lib/auth");

const PUBLIC_PATHS = new Set(["/login.html", "/style.css", "/manifest.json", "/icon.svg", "/pwa.js", "/login.js"]);

const app = express();
app.use(express.json());
app.use("/api", authRouter);

app.use((req, res, next) => {
  if (PUBLIC_PATHS.has(req.path) || isAuthenticated(req)) return next();
  if (req.path.startsWith("/api/")) return res.status(401).json({ error: "unauthorized" });
  res.redirect("/login.html");
});

app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/checkins", checkinsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/checklist", checklistRouter);
app.use("/api/diary", diaryRouter);
app.use("/api/wrongnotes", wrongnotesRouter);
app.use("/api/settings", settingsRouter);
app.use("/api/goals", goalsRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

module.exports = app;
