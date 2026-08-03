const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../public/intervention-engine.js");

function goalWith(behavior) {
  return { id: "g1", behavior: { enabled: true, timezone: "Asia/Seoul", snoozeMinutes: 5, maxSnoozeCount: 3, ...behavior } };
}

test("shouldNotifyNow is false before the scheduled KST time", () => {
  const goal = goalWith({ time: "19:00" });
  const now = new Date("2026-08-03T09:59:00.000Z"); // 18:59 KST
  const occurrence = engine.getTodayOccurrence(goal, now);
  assert.equal(occurrence.scheduledFor, "2026-08-03T10:00:00.000Z");
  assert.equal(engine.shouldNotifyNow(occurrence, now), false);
});

test("shouldNotifyNow is true exactly at the scheduled KST time", () => {
  const goal = goalWith({ time: "19:00" });
  const now = new Date("2026-08-03T10:00:00.000Z"); // 19:00 KST
  const occurrence = engine.getTodayOccurrence(goal, now);
  assert.equal(engine.shouldNotifyNow(occurrence, now), true);
});

test("occurrenceKey is stable across different `now` values within the same local day", () => {
  const goal = goalWith({ time: "19:00" });
  const a = engine.getTodayOccurrence(goal, new Date("2026-08-03T01:00:00.000Z"));
  const b = engine.getTodayOccurrence(goal, new Date("2026-08-03T13:00:00.000Z"));
  assert.equal(a.occurrenceKey, b.occurrenceKey);
  assert.equal(a.occurrenceKey, "g1:2026-08-03:19:00");
});

test("getNextIntervention adds snoozeMinutes to now", () => {
  const now = "2026-08-03T10:00:00.000Z";
  const next = engine.getNextIntervention({ snoozeCount: 0, maxSnoozeCount: 3 }, now, 5);
  assert.equal(next, "2026-08-03T10:05:00.000Z");
});

test("canSnooze is false once snoozeCount reaches maxSnoozeCount", () => {
  assert.equal(engine.canSnooze({ snoozeCount: 2, maxSnoozeCount: 3 }), true);
  assert.equal(engine.canSnooze({ snoozeCount: 3, maxSnoozeCount: 3 }), false);
});

test("getLocalDateString uses the KST calendar date even when it differs from UTC's", () => {
  // 2026-08-03T16:30:00Z is 2026-08-04 01:30 in Asia/Seoul (UTC+9).
  const now = new Date("2026-08-03T16:30:00.000Z");
  assert.equal(engine.getLocalDateString(now, "Asia/Seoul"), "2026-08-04");
});

test("isValidTransition allows the documented transitions", () => {
  const validPairs = [
    ["scheduled", "notified"],
    ["scheduled", "started"],
    ["scheduled", "skipped"],
    ["notified", "snoozed"],
    ["notified", "started"],
    ["notified", "skipped"],
    ["notified", "missed"],
    ["snoozed", "notified"],
    ["snoozed", "started"],
    ["snoozed", "skipped"],
    ["snoozed", "missed"],
    ["started", "completed"],
    ["started", "skipped"],
  ];
  for (const [from, to] of validPairs) {
    assert.equal(engine.isValidTransition(from, to), true, `${from} -> ${to} should be valid`);
  }
});

test("isValidTransition rejects transitions out of terminal states", () => {
  const invalidPairs = [
    ["completed", "started"],
    ["skipped", "completed"],
    ["missed", "snoozed"],
  ];
  for (const [from, to] of invalidPairs) {
    assert.equal(engine.isValidTransition(from, to), false, `${from} -> ${to} should be invalid`);
  }
});

test("completed, skipped and missed are terminal (no outgoing transitions)", () => {
  assert.deepEqual(engine.TRANSITIONS.completed, []);
  assert.deepEqual(engine.TRANSITIONS.skipped, []);
  assert.deepEqual(engine.TRANSITIONS.missed, []);
});

test("getTodayOccurrence returns null when behavior is disabled or unset", () => {
  assert.equal(engine.getTodayOccurrence({ id: "g1" }, new Date()), null);
  assert.equal(engine.getTodayOccurrence(goalWith({ enabled: false, time: "19:00" }), new Date()), null);
  assert.equal(engine.getTodayOccurrence(goalWith({ time: null }), new Date()), null);
});
