// Read-time defaulting for the Goal.behavior field. Existing goals.json files
// written before this field existed are never rewritten on disk — callers
// just get the defaults merged in on read. No migration, no backup needed.

function normalizeGoal(goal) {
  if (!goal) return goal;
  return {
    ...goal,
    behavior: {
      enabled: false,
      time: null,
      timezone: "Asia/Seoul",
      snoozeMinutes: 5,
      maxSnoozeCount: 3,
      // Bumped only when time/timezone actually change (routes/goals.js) so
      // native notifications scheduled under an old value can recognize
      // themselves as stale — see docs/ANDROID_ARCHITECTURE.md.
      scheduleVersion: 1,
      ...(goal.behavior || {}),
    },
  };
}

module.exports = { normalizeGoal };
