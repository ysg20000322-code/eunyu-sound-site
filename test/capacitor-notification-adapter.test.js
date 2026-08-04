const test = require("node:test");
const assert = require("node:assert/strict");
const adapter = require("../public/capacitor-notification-adapter.js");

test("hashToId is deterministic and always a non-negative 31-bit int", () => {
  const a = adapter.hashToId("goal-123:daily");
  const b = adapter.hashToId("goal-123:daily");
  assert.equal(a, b);
  assert.ok(Number.isInteger(a));
  assert.ok(a >= 0 && a <= 0x7fffffff);
});

test("dailyNotificationId and snoozeNotificationId differ for the same goal", () => {
  const daily = adapter.dailyNotificationId("goal-123");
  const snooze = adapter.snoozeNotificationId("goal-123");
  assert.notEqual(daily, snooze);
});

test("different goalIds map to different notification ids (no accidental collision for these ids)", () => {
  assert.notEqual(adapter.dailyNotificationId("goal-123"), adapter.dailyNotificationId("goal-456"));
});

test("planActionSequence: scheduled + snoozed goes through notified first", () => {
  assert.deepEqual(adapter.planActionSequence("scheduled", "snoozed"), ["notified", "snoozed"]);
});

test("planActionSequence: scheduled + started/skipped also passes through notified for an accurate audit trail", () => {
  assert.deepEqual(adapter.planActionSequence("scheduled", "started"), ["notified", "started"]);
  assert.deepEqual(adapter.planActionSequence("scheduled", "skipped"), ["notified", "skipped"]);
});

test("planActionSequence: already-notified goes straight to the requested action", () => {
  assert.deepEqual(adapter.planActionSequence("notified", "started"), ["started"]);
  assert.deepEqual(adapter.planActionSequence("snoozed", "started"), ["started"]);
});

test("planActionSequence: current status equal to the action is a no-op", () => {
  assert.deepEqual(adapter.planActionSequence("started", "started"), []);
});

test("in a non-browser environment only the pure helpers are exposed", () => {
  assert.equal(typeof adapter.isAvailable, "undefined");
  assert.equal(typeof adapter.reconcile, "undefined");
});

test("buildDailyExtra carries kind/goalId/scheduleVersion/nominalTime/timezone", () => {
  const goal = { id: "goal-123", behavior: { time: "19:00", timezone: "Asia/Seoul", scheduleVersion: 3 } };
  assert.deepEqual(adapter.buildDailyExtra(goal), {
    kind: "daily-reminder",
    goalId: "goal-123",
    scheduleVersion: 3,
    nominalTime: "19:00",
    timezone: "Asia/Seoul",
  });
});

test("buildSnoozeExtra carries kind/goalId/occurrenceKey/scheduleVersion", () => {
  const goal = { id: "goal-123", behavior: { scheduleVersion: 3 } };
  assert.deepEqual(adapter.buildSnoozeExtra(goal, "goal-123:2026-08-03:19:00"), {
    kind: "snooze",
    goalId: "goal-123",
    occurrenceKey: "goal-123:2026-08-03:19:00",
    scheduleVersion: 3,
  });
});

test("isStaleAction: true only when both versions are known and differ", () => {
  assert.equal(adapter.isStaleAction(2, 3), true);
  assert.equal(adapter.isStaleAction(3, 3), false);
});

test("isStaleAction: fails open (not stale) when either version is unknown — legacy notifications", () => {
  assert.equal(adapter.isStaleAction(undefined, 3), false);
  assert.equal(adapter.isStaleAction(2, undefined), false);
  assert.equal(adapter.isStaleAction(null, null), false);
});

test("shouldStopRetrying: false below the cap, true at/after it", () => {
  assert.equal(adapter.shouldStopRetrying(0), false);
  assert.equal(adapter.shouldStopRetrying(adapter.MAX_RETRY_COUNT - 1), false);
  assert.equal(adapter.shouldStopRetrying(adapter.MAX_RETRY_COUNT), true);
  assert.equal(adapter.shouldStopRetrying(adapter.MAX_RETRY_COUNT + 1), true);
});
