/**
 * LifeApp.InterventionUI — home-screen UI for the goal-behavior intervention
 * system. Talks to /api/goal-executions and /api/goals, and reuses the pure
 * decision functions from LifeApp.InterventionEngine — this file only owns
 * rendering, DOM events, and network calls.
 *
 * Self-initializing: runs on DOMContentLoaded and re-checks whenever
 * home.js dispatches "lifeapp:goal-updated" after a goal/behavior save.
 */
(function () {
  "use strict";

  function requireDep(name, value) {
    if (!value) {
      throw new Error(
        `LifeApp.InterventionUI: missing dependency "${name}" — is its <script> tag present before intervention-ui.js?`
      );
    }
    return value;
  }

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const LifeApp = window.LifeApp || {};
    const engine = requireDep("LifeApp.InterventionEngine", LifeApp.InterventionEngine);
    const messages = requireDep("LifeApp.CompanionMessages", LifeApp.CompanionMessages);

    const els = {
      todayAction: document.getElementById("todayAction"),
      todayActionText: document.getElementById("todayActionText"),
      todayActionBtn: document.getElementById("todayActionBtn"),
      testTriggerBtn: document.getElementById("testTriggerBtn"),

      overlay: document.getElementById("interventionOverlay"),
      close: document.getElementById("interventionClose"),
      emoji: document.getElementById("interventionEmoji"),
      message: document.getElementById("interventionMessage"),
      actions: document.getElementById("interventionActions"),
      startBtn: document.getElementById("interventionStartBtn"),
      snoozeBtn: document.getElementById("interventionSnoozeBtn"),
      skipBtn: document.getElementById("interventionSkipBtn"),
      startedActions: document.getElementById("interventionStartedActions"),
      completeBtn: document.getElementById("interventionCompleteBtn"),
      skipStartedBtn: document.getElementById("interventionSkipStartedBtn"),
      success: document.getElementById("interventionSuccess"),
      status: document.getElementById("interventionStatus"),
    };

    // If index.html hasn't been updated with the intervention markup yet,
    // fail loudly instead of silently doing nothing.
    for (const [key, el] of Object.entries(els)) {
      if (!el) throw new Error(`LifeApp.InterventionUI: missing element #${key} in the DOM`);
    }

    let goal = null;
    let pollTimer = null;
    let busy = false; // true while a transition/test-trigger request is in flight
    let testTriggerEnabled = false;

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

    // /api/goals is one of the existing 8 routers — plain JSON, no envelope.
    async function fetchPlain(url, options) {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
      return res.json();
    }

    function setStatusText(text) {
      els.status.textContent = text || "";
    }

    function setBusy(nextBusy) {
      busy = nextBusy;
      [els.startBtn, els.snoozeBtn, els.skipBtn, els.completeBtn, els.skipStartedBtn, els.todayActionBtn, els.testTriggerBtn].forEach(
        (btn) => (btn.disabled = nextBusy)
      );
    }

    function closeModal() {
      els.overlay.hidden = true;
      setStatusText("");
    }

    els.close.addEventListener("click", closeModal);
    els.overlay.addEventListener("click", (e) => {
      if (e.target === els.overlay) closeModal();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !els.overlay.hidden) closeModal();
    });

    function renderCompanion(status) {
      const { emoji, message } = messages.forStatus(status, goal);
      els.emoji.textContent = emoji;
      els.message.textContent = message;
    }

    const TERMINAL_STATUSES = new Set(["completed", "skipped", "missed"]);

    function openModalFor(execution) {
      renderCompanion(execution.status);
      els.success.hidden = true;
      setStatusText("");

      if (TERMINAL_STATUSES.has(execution.status)) {
        // Already decided for today (e.g. dev test-trigger pressed after completing) —
        // nothing left to transition into, so show the message only, no action buttons.
        els.actions.hidden = true;
        els.startedActions.hidden = true;
      } else if (execution.status === "started") {
        els.actions.hidden = true;
        els.startedActions.hidden = false;
      } else {
        els.actions.hidden = false;
        els.startedActions.hidden = true;
        els.snoozeBtn.hidden = !engine.canSnooze(execution);
      }
      els.overlay.hidden = false;
    }

    async function transition(execution, to) {
      setBusy(true);
      setStatusText("처리 중...");
      try {
        const updated = await fetchEnvelope(`/api/goal-executions/${execution.id}/transition`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to, source: "user" }),
        });

        if (to === "completed") {
          els.actions.hidden = true;
          els.startedActions.hidden = true;
          els.success.hidden = false;
          setStatusText("");
          setTimeout(closeModal, 1500);
        } else if (to === "started") {
          openModalFor(updated);
        } else {
          // snoozed / skipped — nothing more to decide right now.
          closeModal();
        }

        await renderTodayAction(updated);
      } catch (err) {
        setStatusText(err.message || "처리에 실패했어요. 다시 시도해주세요.");
      } finally {
        setBusy(false);
      }
    }

    els.startBtn.addEventListener("click", () => currentExecution && transition(currentExecution, "started"));
    els.snoozeBtn.addEventListener("click", () => currentExecution && transition(currentExecution, "snoozed"));
    els.skipBtn.addEventListener("click", () => currentExecution && transition(currentExecution, "skipped"));
    els.completeBtn.addEventListener("click", () => currentExecution && transition(currentExecution, "completed"));
    els.skipStartedBtn.addEventListener("click", () => currentExecution && transition(currentExecution, "skipped"));

    let currentExecution = null;

    function formatTime(isoString) {
      const d = new Date(isoString);
      return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    }

    async function renderTodayAction(execution) {
      currentExecution = execution;

      if (!execution) {
        els.todayAction.hidden = true;
        return;
      }

      els.todayAction.hidden = false;
      els.todayActionBtn.hidden = true;

      const now = new Date();

      switch (execution.status) {
        case "scheduled": {
          if (engine.shouldNotifyNow({ scheduledFor: execution.scheduledFor }, now)) {
            const updated = await fetchEnvelope(`/api/goal-executions/${execution.id}/transition`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: "notified", source: "system" }),
            }).catch(() => execution); // if the transition races, fall back to showing what we had
            currentExecution = updated;
            els.todayActionText.textContent = `"${goal.title}" 시작할 시간이에요!`;
            els.todayActionBtn.hidden = false;
            els.todayActionBtn.textContent = "확인하기";
            openModalFor(updated);
          } else {
            els.todayActionText.textContent = `오늘 ${formatTime(execution.scheduledFor)}에 "${goal.title}" 예정이에요.`;
          }
          break;
        }
        case "notified": {
          els.todayActionText.textContent = `"${goal.title}" 시작할 시간이에요!`;
          els.todayActionBtn.hidden = false;
          els.todayActionBtn.textContent = "확인하기";
          break;
        }
        case "snoozed": {
          if (engine.shouldNotifyNow({ scheduledFor: execution.nextInterventionAt }, now)) {
            const updated = await fetchEnvelope(`/api/goal-executions/${execution.id}/transition`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ to: "notified", source: "system" }),
            }).catch(() => execution);
            currentExecution = updated;
            els.todayActionText.textContent = `"${goal.title}" 시작할 시간이에요!`;
            els.todayActionBtn.hidden = false;
            els.todayActionBtn.textContent = "확인하기";
            openModalFor(updated);
          } else {
            els.todayActionText.textContent = `미뤄뒀어요. ${formatTime(execution.nextInterventionAt)}에 다시 물어볼게요.`;
            els.todayActionBtn.hidden = false;
            els.todayActionBtn.textContent = "지금 확인하기";
          }
          break;
        }
        case "started": {
          els.todayActionText.textContent = `"${goal.title}" 진행 중이에요.`;
          els.todayActionBtn.hidden = false;
          els.todayActionBtn.textContent = "확인하기";
          break;
        }
        case "completed": {
          els.todayActionText.textContent = "오늘 완료했어요! 🎉";
          break;
        }
        case "skipped": {
          els.todayActionText.textContent = "오늘은 건너뛰었어요.";
          break;
        }
        case "missed": {
          els.todayActionText.textContent = "이번엔 놓쳤어요.";
          break;
        }
        default: {
          els.todayActionText.textContent = "";
        }
      }
    }

    els.todayActionBtn.addEventListener("click", () => {
      if (currentExecution) openModalFor(currentExecution);
    });

    els.testTriggerBtn.addEventListener("click", async () => {
      if (!goal || busy) return;
      setBusy(true);
      try {
        const execution = await fetchEnvelope("/api/goal-executions/test-trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goalId: goal.id }),
        });
        await renderTodayAction(execution);
        openModalFor(execution);
      } catch (err) {
        setStatusText(err.message || "테스트 트리거 실패");
      } finally {
        setBusy(false);
      }
    });

    async function checkTestTriggerAvailability() {
      try {
        const data = await fetchEnvelope("/api/goal-executions/test-trigger-status");
        testTriggerEnabled = Boolean(data.enabled);
      } catch (err) {
        testTriggerEnabled = false;
      }
      els.testTriggerBtn.hidden = !testTriggerEnabled || !goal || !goal.behavior.enabled;
    }

    async function refresh() {
      try {
        goal = await fetchPlain("/api/goals");
      } catch (err) {
        goal = null;
      }

      if (!goal || !goal.behavior || !goal.behavior.enabled || !goal.behavior.time) {
        els.todayAction.hidden = true;
        els.testTriggerBtn.hidden = true;
        stopPolling();
        return;
      }

      await checkTestTriggerAvailability();

      try {
        const execution = await fetchEnvelope(`/api/goal-executions/today?goalId=${encodeURIComponent(goal.id)}`);
        await renderTodayAction(execution);
      } catch (err) {
        els.todayAction.hidden = false;
        els.todayActionText.textContent = "오늘의 행동 상태를 불러오지 못했어요.";
        els.todayActionBtn.hidden = true;
      }

      startPolling();
    }

    function startPolling() {
      stopPolling();
      pollTimer = setInterval(() => {
        if (busy || !els.overlay.hidden) return; // don't yank state out from under an open modal or in-flight request
        refresh();
      }, 30000);
    }

    function stopPolling() {
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = null;
    }

    document.addEventListener("lifeapp:goal-updated", refresh);

    refresh();
  }
})();
