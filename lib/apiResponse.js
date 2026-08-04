// Response envelope helpers for newly-added endpoints only.
// Existing routers (goals, settings, events, activities, checklist, diary,
// wrongnotes, checkins) keep their raw-JSON response shape unchanged.

function ok(data) {
  return { ok: true, data };
}

function fail(code, message) {
  return { ok: false, error: { code, message } };
}

module.exports = { ok, fail };
