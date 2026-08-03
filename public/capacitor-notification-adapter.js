/**
 * LifeApp.CapacitorNotificationAdapter — native delivery layer for the
 * goal-behavior intervention system, used only inside the Android shell.
 *
 * Scope is intentionally narrow: schedule / cancel / check permissions /
 * receive notification actions / forward them to the existing engine+API.
 * occurrenceKey generation and status-transition rules are never duplicated
 * here — every action re-resolves "today" via GET /api/goal-executions/today
 * and applies transitions through the same PATCH endpoint the in-app modal
 * uses (routes/goalExecutions.js, public/intervention-engine.js).
 *
 * The pure helpers (hashing, action-sequence planning) have no dependency on
 * `window`/`Capacitor` and are exported for both Node (`require`, see
 * test/capacitor-notification-adapter.test.js) and the browser. Everything
 * past that point only runs when `Capacitor.isNativePlatform()` is true; in
 * a normal desktop browser (or Node) this module is a no-op.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(null);
  } else {
    root.LifeApp = root.LifeApp || {};
    root.LifeApp.CapacitorNotificationAdapter = factory(root);
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  // ---- pure helpers: deterministic, no platform APIs, unit-testable ----

  // FNV-1a 32-bit, masked to a positive 31-bit int (LocalNotifications ids are plain numbers).
  function hashToId(str) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0) & 0x7fffffff;
  }

  function dailyNotificationId(goalId) {
    return hashToId(`${goalId}:daily`);
  }

  function snoozeNotificationId(goalId) {
    return hashToId(`${goalId}:snooze`);
  }

  // What transition(s) to send, in order, given the execution's current
  // status and the action tapped on the notification. A still-"scheduled"
  // record (app never opened since the alarm fired) always passes through
  // "notified" first, since scheduled->snoozed isn't a valid direct
  // transition and the audit trail should reflect that the notification did
  // fire before the user acted on it.
  function planActionSequence(currentStatus, action) {
    if (currentStatus === action) return [];
    if (currentStatus === "scheduled" && action !== "notified") return ["notified", action];
    return [action];
  }

  const pure = { hashToId, dailyNotificationId, snoozeNotificationId, planActionSequence };

  if (!root || !root.document) {
    // Node or another non-browser context: only the pure helpers are usable.
    return pure;
  }

  const Capacitor = root.Capacitor;
  const isNative = Boolean(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  const LocalNotifications = isNative && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
  const CapApp = isNative && Capacitor.Plugins && Capacitor.Plugins.App;

  if (!isNative || !LocalNotifications) {
    return Object.assign({}, pure, { isAvailable: () => false });
  }

  const ACTION_TARGETS = { start: "started", snooze: "snoozed", skip: "skipped" };

  function actionTypeId(goalId) {
    return `goal-actions-${goalId}`;
  }

  async function applyNotificationAction(goalId, action) {
    const ApiClient = root.LifeApp && root.LifeApp.ApiClient;
    if (!ApiClient) {
      console.error("[capacitor-notification-adapter] LifeApp.ApiClient missing — is api-client.js loaded first?");
      return;
    }
    try {
      const execution = await ApiClient.fetchEnvelope(
        `/api/goal-executions/today?goalId=${encodeURIComponent(goalId)}`
      );
      if (!execution) return; // reminder was disabled/removed after the notification was scheduled

      let current = execution;
      for (const to of pure.planActionSequence(execution.status, action)) {
        current = await ApiClient.fetchEnvelope(`/api/goal-executions/${current.id}/transition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, source: "notification" }),
        }).catch((err) => {
          // e.g. today's goal was already resolved through the in-app modal in the
          // meantime — the transition table will reject it, which is fine, nothing
          // left to do.
          console.warn("[capacitor-notification-adapter] transition to", to, "rejected:", err.message);
          return current;
        });
      }
    } catch (err) {
      console.error("[capacitor-notification-adapter] failed to apply notification action:", err);
    } finally {
      root.document.dispatchEvent(new root.CustomEvent("lifeapp:goal-updated"));
    }
  }

  // Register as early as possible (top-level, not waiting for DOMContentLoaded)
  // so a cold start triggered by tapping a notification action isn't missed.
  LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const goalId = event && event.notification && event.notification.extra && event.notification.extra.goalId;
    const target = event && ACTION_TARGETS[event.actionId];
    if (goalId && target) applyNotificationAction(goalId, target);
  });

  async function ensurePermissions() {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted";
  }

  async function checkExactAlarmAllowed() {
    if (typeof LocalNotifications.checkExactNotificationSetting !== "function") return true;
    const result = await LocalNotifications.checkExactNotificationSetting();
    return result && result.exact_alarm === "granted";
  }

  async function requestExactAlarmSetting() {
    if (typeof LocalNotifications.changeExactNotificationSetting !== "function") return true;
    const result = await LocalNotifications.changeExactNotificationSetting();
    return result && result.exact_alarm === "granted";
  }

  async function registerActionTypes(goalId) {
    await LocalNotifications.registerActionTypes({
      types: [
        {
          id: actionTypeId(goalId),
          actions: [
            { id: "start", title: "시작" },
            { id: "snooze", title: "5분 미루기" },
            { id: "skip", title: "오늘 건너뛰기" },
          ],
        },
      ],
    });
  }

  async function cancelDaily(goalId) {
    if (!goalId) return;
    await LocalNotifications.cancel({ notifications: [{ id: pure.dailyNotificationId(goalId) }] });
  }

  async function cancelSnooze(goalId) {
    if (!goalId) return;
    await LocalNotifications.cancel({ notifications: [{ id: pure.snoozeNotificationId(goalId) }] });
  }

  async function cancelAll(goalId) {
    await cancelDaily(goalId);
    await cancelSnooze(goalId);
  }

  // Returns { granted, exactAlarmAllowed } so the caller (home.js's goal-save
  // handler, in a later change) can surface a banner when either is false.
  async function scheduleDaily(goal) {
    const granted = await ensurePermissions();
    if (!granted) return { granted: false, exactAlarmAllowed: false };

    await registerActionTypes(goal.id);
    const [hour, minute] = goal.behavior.time.split(":").map(Number);
    const exactAlarmAllowed = await checkExactAlarmAllowed();

    await LocalNotifications.schedule({
      notifications: [
        {
          id: pure.dailyNotificationId(goal.id),
          title: "오늘의 행동",
          body: `"${goal.title}" 시작할 시간이에요!`,
          schedule: { on: { hour, minute }, allowWhileIdle: true },
          actionTypeId: actionTypeId(goal.id),
          extra: { goalId: goal.id },
        },
      ],
    });
    return { granted: true, exactAlarmAllowed };
  }

  async function scheduleSnooze(goal, nextInterventionAt) {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: pure.snoozeNotificationId(goal.id),
          title: "오늘의 행동",
          body: `"${goal.title}" 다시 확인할 시간이에요!`,
          schedule: { at: new Date(nextInterventionAt), allowWhileIdle: true },
          actionTypeId: actionTypeId(goal.id),
          extra: { goalId: goal.id },
        },
      ],
    });
  }

  // ---- minimal self-contained permission banner (no index.html/CSS changes needed) ----

  let bannerEl = null;

  function ensureBannerEl() {
    if (bannerEl) return bannerEl;
    bannerEl = root.document.createElement("div");
    bannerEl.id = "capNotificationBanner";
    bannerEl.style.cssText =
      "display:none;position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;" +
      "background:#3a2e00;color:#ffe08a;border:1px solid #b58a00;border-radius:10px;" +
      "padding:10px 12px;font-size:13px;align-items:center;gap:8px;box-shadow:0 4px 12px rgba(0,0,0,.3);";
    const text = root.document.createElement("span");
    text.id = "capNotificationBannerText";
    text.style.flex = "1";
    const btn = root.document.createElement("button");
    btn.id = "capNotificationBannerBtn";
    btn.style.cssText = "border:none;border-radius:6px;padding:6px 10px;background:#ffe08a;color:#3a2e00;font-weight:600;";
    bannerEl.appendChild(text);
    bannerEl.appendChild(btn);
    root.document.body.appendChild(bannerEl);
    return bannerEl;
  }

  function hideBanner() {
    if (bannerEl) bannerEl.style.display = "none";
  }

  function showBanner(message, buttonText, onClick) {
    const el = ensureBannerEl();
    el.style.display = "flex";
    el.querySelector("#capNotificationBannerText").textContent = message;
    const btn = el.querySelector("#capNotificationBannerBtn");
    btn.textContent = buttonText;
    btn.onclick = onClick;
  }

  function updatePermissionBanner(scheduleResult) {
    if (!scheduleResult || scheduleResult.granted === false) {
      showBanner("알림 권한이 꺼져 있어요. 앱을 닫아도 리마인더를 받으려면 켜주세요.", "권한 요청", async () => {
        const granted = await ensurePermissions();
        if (granted) await reconcile();
      });
    } else if (!scheduleResult.exactAlarmAllowed) {
      showBanner("정확한 시각 알림을 켜면 오차 없이 받을 수 있어요.", "설정 열기", async () => {
        await requestExactAlarmSetting();
        await reconcile();
      });
    } else {
      hideBanner();
    }
  }

  // Re-syncs native schedule with server state. Safe to call repeatedly
  // (schedule() overwrites by id, cancel() on a missing id is a no-op).
  // `staleGoalHint` carries the goal that was just deleted/disabled so its
  // alarms can still be cancelled after the server no longer has it.
  async function reconcile(staleGoalHint) {
    const ApiClient = root.LifeApp && root.LifeApp.ApiClient;
    if (!ApiClient) return;

    let goal;
    try {
      goal = await ApiClient.fetchPlain("/api/goals");
    } catch (err) {
      return;
    }

    const hasActiveSchedule = Boolean(goal && goal.behavior && goal.behavior.enabled && goal.behavior.time && !goal.completedAt);
    if (!hasActiveSchedule) {
      const staleId = (goal && goal.id) || (staleGoalHint && staleGoalHint.id);
      if (staleId) await cancelAll(staleId);
      hideBanner();
      return;
    }

    const scheduleResult = await scheduleDaily(goal);
    updatePermissionBanner(scheduleResult);

    try {
      const execution = await ApiClient.fetchEnvelope(`/api/goal-executions/today?goalId=${encodeURIComponent(goal.id)}`);
      if (execution && execution.status === "snoozed" && execution.nextInterventionAt) {
        await scheduleSnooze(goal, execution.nextInterventionAt);
      } else {
        await cancelSnooze(goal.id);
      }
    } catch (err) {
      // daily schedule above already reconciled; snooze follow-up just stays as-is
    }
  }

  if (CapApp) {
    CapApp.addListener("resume", () => reconcile());
  }
  root.document.addEventListener("lifeapp:goal-updated", (event) => reconcile(event && event.detail));
  root.document.addEventListener("DOMContentLoaded", () => reconcile());

  return Object.assign({}, pure, {
    isAvailable: () => true,
    ensurePermissions,
    checkExactAlarmAllowed,
    requestExactAlarmSetting,
    scheduleDaily,
    scheduleSnooze,
    cancelAll,
    reconcile,
  });
});
