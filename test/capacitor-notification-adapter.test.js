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
