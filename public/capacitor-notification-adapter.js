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
 * The pure helpers (hashing, action-sequence planning, staleness/retry
 * decisions, extra-payload shape) have no dependency on `window`/`Capacitor`
 * and are exported for both Node (`require`, see
 * test/capacitor-notification-adapter.test.js) and the browser. Everything
 * past that point only runs when `Capacitor.isNativePlatform()` is true; in
 * a normal desktop browser (or Node) this module is a no-op.
 *
 * See docs/ANDROID_ARCHITECTURE.md for the scheduleVersion / stale-notification
 * / offline-action-queue design this file implements.
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

  const MAX_RETRY_COUNT = 5;

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

  // extra payloads carried by each scheduled notification. `kind` lets a
  // future action handler tell them apart without guessing; scheduleVersion
  // is what lets a stale notification (scheduled before the goal's time/
  // timezone last changed) recognize itself as outdated.
  function buildDailyExtra(goal) {
    return {
      kind: "daily-reminder",
      goalId: goal.id,
      scheduleVersion: goal.behavior.scheduleVersion,
      nominalTime: goal.behavior.time,
      timezone: goal.behavior.timezone,
    };
  }

  function buildSnoozeExtra(goal, occurrenceKey) {
    return {
      kind: "snooze",
      goalId: goal.id,
      occurrenceKey,
      scheduleVersion: goal.behavior.scheduleVersion,
    };
  }

  // A notification's baked-in scheduleVersion vs. the goal's current one.
  // Missing/unknown versions (legacy notifications scheduled before this
  // field existed) fail open — never treated as stale.
  function isStaleAction(notificationVersion, currentVersion) {
    if (notificationVersion == null || currentVersion == null) return false;
    return notificationVersion !== currentVersion;
  }

  function shouldStopRetrying(retryCount) {
    return retryCount >= MAX_RETRY_COUNT;
  }

  const pure = {
    MAX_RETRY_COUNT,
    hashToId,
    dailyNotificationId,
    snoozeNotificationId,
    planActionSequence,
    buildDailyExtra,
    buildSnoozeExtra,
    isStaleAction,
    shouldStopRetrying,
  };

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

  // ---- offline-safe local action queue (localStorage; no new dependency) ----
  //
  // A notification action is persisted here BEFORE any network call is made,
  // and only removed once the server has confirmed it. This is what makes a
  // tap survive "no network right now" instead of silently vanishing — the
  // previous version of this file just logged and dropped it.

  const QUEUE_KEY = "lifeapp.pendingNotificationActions";

  function readQueue() {
    try {
      const raw = root.localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function writeQueue(queue) {
    try {
      root.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
      console.error("[capacitor-notification-adapter] failed to persist action queue:", err);
    }
  }

  function enqueueAction(entry) {
    const queue = readQueue();
    queue.push(entry);
    writeQueue(queue);
  }

  let processingQueue = false;

  // Drains the pending-action queue against the server. Safe to call
  // repeatedly/concurrently (guarded by `processingQueue`) — called right
  // after an action is enqueued, and again on every app resume/launch so a
  // tap made while offline gets retried once connectivity is back.
  async function processQueue() {
    if (processingQueue) return;
    processingQueue = true;
    try {
      const ApiClient = root.LifeApp && root.LifeApp.ApiClient;
      if (!ApiClient) return;

      const queue = readQueue();
      if (queue.length === 0) return;

      let currentGoal;
      try {
        currentGoal = await ApiClient.fetchPlain("/api/goals");
      } catch (err) {
        return; // offline — leave the queue untouched, try again next resume
      }
      const currentVersion = currentGoal && currentGoal.behavior && currentGoal.behavior.scheduleVersion;

      let sawStale = false;
      let sawGaveUp = false;
      const remaining = [];

      for (const item of queue) {
        if (pure.isStaleAction(item.scheduleVersion, currentVersion)) {
          sawStale = true;
          continue; // dropped — superseded by a newer schedule, never touches GoalExecution
        }

        try {
          const execution = await ApiClient.fetchEnvelope(
            `/api/goal-executions/today?goalId=${encodeURIComponent(item.goalId)}`
          );
          if (execution) {
            let current = execution;
            for (const to of pure.planActionSequence(execution.status, item.action)) {
              current = await ApiClient.fetchEnvelope(`/api/goal-executions/${current.id}/transition`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ to, source: "notification" }),
              });
            }
          }
          // success (or nothing left to do) — falls through, item is dropped
        } catch (err) {
          const retryCount = item.retryCount + 1;
          if (pure.shouldStopRetrying(retryCount)) sawGaveUp = true;
          remaining.push({ ...item, retryCount, lastError: err.message });
        }
      }

      writeQueue(remaining);

      if (sawStale) {
        showBanner("이전 일정의 알림이었어요. 최신 일정으로 갱신할게요.", "확인", hideBanner);
        await reconcile();
      } else if (sawGaveUp) {
        showBanner("일부 알림 응답을 서버에 반영하지 못했어요. 앱을 열어두면 다시 시도해요.", "확인", hideBanner);
      }

      root.document.dispatchEvent(new root.CustomEvent("lifeapp:goal-updated"));
    } finally {
      processingQueue = false;
    }
  }

  // Register as early as possible (top-level, not waiting for DOMContentLoaded)
  // so a cold start triggered by tapping a notification action isn't missed.
  // The action is enqueued synchronously — the actual network attempt
  // (processQueue) can fail without losing the tap.
  LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const extra = event && event.notification && event.notification.extra;
    const goalId = extra && extra.goalId;
    const target = event && ACTION_TARGETS[event.actionId];
    if (!goalId || !target) return;

    enqueueAction({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      goalId,
      action: target,
      scheduleVersion: extra && extra.scheduleVersion,
      kind: extra && extra.kind,
      actedAt: new Date().toISOString(),
      retryCount: 0,
    });
    processQueue();
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

  // Returns { granted, exactAlarmAllowed } so the caller can surface a banner
  // when either is false. `schedule.on:{hour,minute}` recurs natively every
  // day in the device's current timezone — see docs/DECISIONS.md for the
  // known limitation when that differs from goal.behavior.timezone.
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
          extra: pure.buildDailyExtra(goal),
        },
      ],
    });
    return { granted: true, exactAlarmAllowed };
  }

  // `execution` is today's GoalExecution (already fetched by the caller) so
  // the snooze notification can carry its occurrenceKey.
  async function scheduleSnooze(goal, execution) {
    await LocalNotifications.schedule({
      notifications: [
        {
          id: pure.snoozeNotificationId(goal.id),
          title: "오늘의 행동",
          // Approximate on purpose — Doze/battery optimization can delay a
          // 5-minute alarm by a few minutes on real devices, so the copy
          // shouldn't promise more precision than Android actually gives us.
          body: `"${goal.title}" 다시 확인할 시간이에요!`,
          schedule: { at: new Date(execution.nextInterventionAt), allowWhileIdle: true },
          actionTypeId: actionTypeId(goal.id),
          extra: pure.buildSnoozeExtra(goal, execution.occurrenceKey),
        },
      ],
    });
  }

  // ---- minimal self-contained banner (no index.html/CSS changes needed) ----

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
        await scheduleSnooze(goal, execution);
      } else {
        await cancelSnooze(goal.id);
      }
    } catch (err) {
      // daily schedule above already reconciled; snooze follow-up just stays as-is
    }
  }

  function onAppActive(staleGoalHint) {
    processQueue().finally(() => reconcile(staleGoalHint));
  }

  if (CapApp) {
    CapApp.addListener("resume", () => onAppActive());
  }
  root.document.addEventListener("lifeapp:goal-updated", (event) => reconcile(event && event.detail));
  root.document.addEventListener("DOMContentLoaded", () => onAppActive());

  return Object.assign({}, pure, {
    isAvailable: () => true,
    ensurePermissions,
    checkExactAlarmAllowed,
    requestExactAlarmSetting,
    scheduleDaily,
    scheduleSnooze,
    cancelAll,
    reconcile,
    processQueue,
  });
});
