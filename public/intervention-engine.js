/**
 * LifeApp.InterventionEngine — pure domain logic for goal-behavior interventions.
 *
 * Loaded two ways from the SAME file (no duplication):
 *   - Browser: <script src="/intervention-engine.js"></script> -> globalThis.LifeApp.InterventionEngine
 *   - Node:    require("../public/intervention-engine.js")     -> module.exports
 *
 * All functions take `now` as an explicit argument (never read the clock internally),
 * so behavior is fully deterministic and testable.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeApp = root.LifeApp || {};
    root.LifeApp.InterventionEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  // Allowed status transitions. Terminal states map to an empty list.
  const TRANSITIONS = {
    scheduled: ["notified", "started", "skipped"],
    notified: ["snoozed", "started", "skipped", "missed"],
    snoozed: ["notified", "started", "skipped", "missed"],
    started: ["completed", "skipped"],
    completed: [],
    skipped: [],
    missed: [],
  };

  function toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /** Extract {year, month, day, hour, minute, second} for `date` in `timeZone`. */
  function getZonedDateParts(date, timeZone) {
    const d = toDate(date);
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = {};
    for (const { type, value } of dtf.formatToParts(d)) {
      if (type !== "literal") parts[type] = Number(value);
    }
    return {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: parts.hour === 24 ? 0 : parts.hour,
      minute: parts.minute,
      second: parts.second,
    };
  }

  /** "YYYY-MM-DD" of `date` as observed in `timeZone`. */
  function getLocalDateString(date, timeZone) {
    const p = getZonedDateParts(date, timeZone);
    return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
  }

  /**
   * Convert a wall-clock "HH:mm" on `localDate` in `timeZone` into a UTC Date.
   * Uses a guess-and-correct approach via Intl (no timezone-data dependency needed).
   */
  function zonedTimeToUtc(localDate, hhmm, timeZone) {
    if (!DATE_RE.test(localDate)) throw new Error(`invalid localDate: ${localDate}`);
    if (!TIME_RE.test(hhmm)) throw new Error(`invalid time: ${hhmm}`);
    const [y, m, d] = localDate.split("-").map(Number);
    const [hh, mm] = hhmm.split(":").map(Number);

    const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
    const zoned = getZonedDateParts(guess, timeZone);
    const zonedAsUtcMillis = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
    const offsetMillis = guess.getTime() - zonedAsUtcMillis;
    return new Date(guess.getTime() + offsetMillis);
  }

  /**
   * Compute today's occurrence descriptor for a goal's behavior schedule.
   * Returns null if the goal has no active behavior schedule.
   * Pure: does not read/write storage, does not create an execution record.
   */
  function getTodayOccurrence(goal, now) {
    const behavior = goal && goal.behavior;
    if (!behavior || !behavior.enabled || !behavior.time) return null;

    const timezone = behavior.timezone || "Asia/Seoul";
    const localDate = getLocalDateString(now, timezone);
    const scheduledFor = zonedTimeToUtc(localDate, behavior.time, timezone);
    const occurrenceKey = `${goal.id}:${localDate}:${behavior.time}`;

    return {
      goalId: goal.id,
      occurrenceKey,
      scheduledFor: scheduledFor.toISOString(),
      localDate,
      timezone,
    };
  }

  /** Whether the occurrence's scheduled moment has arrived. */
  function shouldNotifyNow(occurrence, now) {
    return toDate(now).getTime() >= toDate(occurrence.scheduledFor).getTime();
  }

  function isValidTransition(from, to) {
    const allowed = TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
  }

  function canSnooze(execution) {
    if (!execution) return false;
    const max = typeof execution.maxSnoozeCount === "number" ? execution.maxSnoozeCount : 0;
    return execution.snoozeCount < max;
  }

  /** Compute the next intervention instant after snoozing, as an ISO string. */
  function getNextIntervention(execution, now, snoozeMinutes) {
    const minutes = typeof snoozeMinutes === "number" ? snoozeMinutes : 5;
    return new Date(toDate(now).getTime() + minutes * 60 * 1000).toISOString();
  }

  return {
    TRANSITIONS,
    getZonedDateParts,
    getLocalDateString,
    zonedTimeToUtc,
    getTodayOccurrence,
    shouldNotifyNow,
    isValidTransition,
    canSnooze,
    getNextIntervention,
  };
});
