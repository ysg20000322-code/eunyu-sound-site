const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON } = require("../lib/store");
const { ok, fail } = require("../lib/apiResponse");
const { normalizeGoal } = require("../lib/goalSchema");
const engine = require("../public/intervention-engine.js");

const router = express.Router();

async function loadGoal(goalId) {
  const goal = await readJSON("goals", null);
  if (!goal || goal.id !== goalId) return null;
  return normalizeGoal(goal);
}

function findExecution(list, goalId, occurrenceKey) {
  return list.find((e) => e.goalId === goalId && e.occurrenceKey === occurrenceKey);
}

function newExecution(occurrence, goal, { status, isTest } = {}) {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    goalId: occurrence.goalId,
    occurrenceKey: occurrence.occurrenceKey,
    scheduledFor: occurrence.scheduledFor,
    localDate: occurrence.localDate,
    timezone: occurrence.timezone,
    status: status || "scheduled",
    snoozeCount: 0,
    maxSnoozeCount: goal.behavior.maxSnoozeCount,
    nextInterventionAt: null,
    history: [{ from: null, to: status || "scheduled", at: now, source: "system" }],
    isTest: Boolean(isTest),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Get-or-create today's execution for `occurrence`, tolerating a race between
 * concurrent callers (no file locking is available in lib/store.js). After
 * writing, re-reads and reconciles down to a single record per
 * (goalId, occurrenceKey), keeping the earliest-created one.
 */
async function getOrCreateExecution(occurrence, goal, options) {
  const list = await readJSON("goal-executions", []);
  const existing = findExecution(list, occurrence.goalId, occurrence.occurrenceKey);
  if (existing) return existing;

  const record = newExecution(occurrence, goal, options);
  list.push(record);
  await writeJSON("goal-executions", list);

  const fresh = await readJSON("goal-executions", []);
  const dupes = fresh
    .filter((e) => e.goalId === occurrence.goalId && e.occurrenceKey === occurrence.occurrenceKey)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (dupes.length > 1) {
    const winner = dupes[0];
    const deduped = fresh.filter(
      (e) => !(e.goalId === occurrence.goalId && e.occurrenceKey === occurrence.occurrenceKey) || e.id === winner.id
    );
    if (deduped.length !== fresh.length) await writeJSON("goal-executions", deduped);
    return winner;
  }
  return record;
}

/**
 * Apply a status transition to `record` in place. Returns null on success
 * (including the idempotent no-op where `to` already equals the current
 * status), or `{status, code, message}` describing why the transition was
 * rejected.
 */
function applyTransition(record, to, source, goal) {
  if (record.status === to) return null;

  if (to === "snoozed" && !engine.canSnooze(record)) {
    return { status: 409, code: "SNOOZE_LIMIT_REACHED", message: "max snooze count reached" };
  }
  if (!engine.isValidTransition(record.status, to)) {
    return {
      status: 409,
      code: "INVALID_STATUS_TRANSITION",
      message: `cannot transition from ${record.status} to ${to}`,
    };
  }

  const now = new Date().toISOString();
  const from = record.status;
  record.status = to;
  record.updatedAt = now;
  if (to === "snoozed") {
    record.snoozeCount += 1;
    const snoozeMinutes = (goal && goal.behavior.snoozeMinutes) || 5;
    record.nextInterventionAt = engine.getNextIntervention(record, now, snoozeMinutes);
  } else {
    record.nextInterventionAt = null;
  }
  record.history.push({ from, to, at: now, source });
  return null;
}

router.get("/today", async (req, res) => {
  try {
    const goalId = req.query.goalId;
    if (!goalId) return res.status(400).json(fail("INVALID_INPUT", "goalId query param is required"));

    const goal = await loadGoal(goalId);
    if (!goal) return res.status(404).json(fail("GOAL_NOT_FOUND", "no goal with that id"));

    const occurrence = engine.getTodayOccurrence(goal, new Date());
    if (!occurrence) return res.json(ok(null));

    const record = await getOrCreateExecution(occurrence, goal);
    res.json(ok(record));
  } catch (err) {
    console.error("[goal-executions] GET /today failed:", err);
    res.status(500).json(fail("INTERNAL_ERROR", "unexpected error"));
  }
});

router.get("/", async (req, res) => {
  try {
    const goalId = req.query.goalId;
    if (!goalId) return res.status(400).json(fail("INVALID_INPUT", "goalId query param is required"));

    const list = await readJSON("goal-executions", []);
    res.json(ok(list.filter((e) => e.goalId === goalId)));
  } catch (err) {
    console.error("[goal-executions] GET / failed:", err);
    res.status(500).json(fail("INTERNAL_ERROR", "unexpected error"));
  }
});

router.patch("/:id/transition", async (req, res) => {
  try {
    const to = req.body && req.body.to;
    const source = (req.body && req.body.source) || "user";
    if (!to) return res.status(400).json(fail("INVALID_INPUT", "to is required"));

    const list = await readJSON("goal-executions", []);
    const record = list.find((e) => e.id === req.params.id);
    if (!record) return res.status(404).json(fail("EXECUTION_NOT_FOUND", "no execution with that id"));

    const goal = await loadGoal(record.goalId);
    const error = applyTransition(record, to, source, goal);
    if (error) return res.status(error.status).json(fail(error.code, error.message));

    await writeJSON("goal-executions", list);
    res.json(ok(record));
  } catch (err) {
    console.error("[goal-executions] PATCH /:id/transition failed:", err);
    res.status(500).json(fail("INTERNAL_ERROR", "unexpected error"));
  }
});

router.post("/test-trigger", async (req, res) => {
  try {
    const allowed = process.env.NODE_ENV !== "production" || process.env.ALLOW_TEST_TRIGGER === "true";
    if (!allowed) return res.status(403).json(fail("TEST_TRIGGER_DISABLED", "test trigger is disabled"));

    const goalId = req.body && req.body.goalId;
    if (!goalId) return res.status(400).json(fail("INVALID_INPUT", "goalId is required"));

    const goal = await loadGoal(goalId);
    if (!goal) return res.status(404).json(fail("GOAL_NOT_FOUND", "no goal with that id"));

    const occurrence = engine.getTodayOccurrence(goal, new Date());
    if (!occurrence) {
      return res.status(400).json(fail("BEHAVIOR_NOT_CONFIGURED", "goal has no active behavior schedule"));
    }

    // Test occurrences are keyed the same as real ones, so a test-trigger
    // pressed outside the scheduled window naturally lands on a distinct
    // occurrenceKey (different localDate/time) rather than colliding with
    // a real record. If today's occurrence already exists (e.g. still
    // "scheduled" because the real time hasn't hit yet), nudge it straight
    // to "notified" so the test button reliably surfaces the intervention
    // UI; if it's already past that point (started/completed/etc.) leave
    // it as-is rather than force an invalid transition.
    const record = await getOrCreateExecution(occurrence, goal, { status: "notified", isTest: true });
    if (record.status !== "notified") {
      const list = await readJSON("goal-executions", []);
      const stored = list.find((e) => e.id === record.id);
      if (stored && applyTransition(stored, "notified", "test", goal) === null) {
        await writeJSON("goal-executions", list);
        return res.json(ok(stored));
      }
    }
    res.json(ok(record));
  } catch (err) {
    console.error("[goal-executions] POST /test-trigger failed:", err);
    res.status(500).json(fail("INTERNAL_ERROR", "unexpected error"));
  }
});

module.exports = router;
