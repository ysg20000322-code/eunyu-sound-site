const express = require("express");
const path = require("path");

const checkinsRouter = require("../routes/checkins");
const eventsRouter = require("../routes/events");
const activitiesRouter = require("../routes/activities");
const checklistRouter = require("../routes/checklist");
const diaryRouter = require("../routes/diary");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "public")));

app.use("/api/checkins", checkinsRouter);
app.use("/api/events", eventsRouter);
app.use("/api/activities", activitiesRouter);
app.use("/api/checklist", checklistRouter);
app.use("/api/diary", diaryRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "internal server error" });
});

module.exports = app;
