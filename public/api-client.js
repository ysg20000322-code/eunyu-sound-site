/**
 * LifeApp.ApiClient — thin fetch helpers shared by anything that talks to
 * /api/*. Extracted out of intervention-ui.js so the Capacitor notification
 * adapter can reuse the exact same request/response handling instead of
 * duplicating it.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeApp = root.LifeApp || {};
    root.LifeApp.ApiClient = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // /api/goal-executions/* is the new router — always {ok,data}/{ok,error:{code,message}}.
  async function fetchEnvelope(url, options) {
    const res = await fetch(url, options);
    const body = await res.json().catch(() => null);
    if (!res.ok || !body || body.ok === false) {
      const message = (body && body.error && body.error.message) || `요청 실패 (${res.status})`;
      throw new Error(message);
    }
    return body.data;
  }

  // Existing routers (goals, settings, etc.) are plain JSON, no envelope.
  async function fetchPlain(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
    return res.json();
  }

  return { fetchEnvelope, fetchPlain };
});
