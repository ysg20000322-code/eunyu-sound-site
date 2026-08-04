function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const todayKey = fmtDate(new Date());

const qaEls = {
  btn: document.getElementById("quickAddBtn"),
  overlay: document.getElementById("quickAddOverlay"),
  close: document.getElementById("quickAddClose"),
  tabs: document.querySelectorAll(".quickadd-tab"),
  panels: document.querySelectorAll(".quickadd-panel"),
  status: document.getElementById("qaStatus"),

  eventTime: document.getElementById("qaEventTime"),
  eventTitle: document.getElementById("qaEventTitle"),
  eventSave: document.getElementById("qaEventSave"),

  checklistText: document.getElementById("qaChecklistText"),
  checklistSave: document.getElementById("qaChecklistSave"),

  diaryText: document.getElementById("qaDiaryText"),
  diarySave: document.getElementById("qaDiarySave"),
};

qaEls.btn.addEventListener("click", () => {
  qaEls.status.textContent = "";
  qaEls.overlay.hidden = false;
});
qaEls.close.addEventListener("click", () => (qaEls.overlay.hidden = true));
qaEls.overlay.addEventListener("click", (e) => {
  if (e.target === qaEls.overlay) qaEls.overlay.hidden = true;
});

qaEls.tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    qaEls.tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.target;
    qaEls.panels.forEach((p) => (p.hidden = p.id !== target));
  });
});

qaEls.eventSave.addEventListener("click", async () => {
  const title = qaEls.eventTitle.value.trim();
  if (!title) return;
  await fetch(`/api/events/${todayKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, time: qaEls.eventTime.value }),
  });
  qaEls.eventTitle.value = "";
  qaEls.eventTime.value = "";
  qaEls.status.textContent = "오늘 일정에 추가됐어요 ✓";
});

qaEls.checklistSave.addEventListener("click", async () => {
  const text = qaEls.checklistText.value.trim();
  if (!text) return;
  await fetch(`/api/checklist/${todayKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  qaEls.checklistText.value = "";
  qaEls.status.textContent = "체크리스트에 추가됐어요 ✓";
});

qaEls.diarySave.addEventListener("click", async () => {
  const text = qaEls.diaryText.value.trim();
  if (!text) return;
  await fetch(`/api/diary/${todayKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  qaEls.status.textContent = "일기가 저장됐어요 ✓";
});

// ---- 모듈 표시/숨김 ----

const MODULE_LABELS = { calendar: "캘린더", diary: "일기", history: "활동 이력", wrongnotes: "오답노트" };
const moduleToggleList = document.getElementById("moduleToggleList");

function applyEnabledModules(enabledModules) {
  document.querySelectorAll("#tileGrid [data-module]").forEach((tile) => {
    tile.hidden = enabledModules[tile.dataset.module] === false;
  });
  document.querySelectorAll("#sideMenu [data-module-item]").forEach((li) => {
    li.hidden = enabledModules[li.dataset.moduleItem] === false;
  });
}

function renderModuleToggles(enabledModules) {
  moduleToggleList.innerHTML = "";
  Object.keys(MODULE_LABELS).forEach((key) => {
    const row = document.createElement("div");
    row.className = "theme-row";
    row.innerHTML = `<span>${MODULE_LABELS[key]}</span>
      <label class="switch">
        <input type="checkbox" ${enabledModules[key] !== false ? "checked" : ""}>
        <span class="switch-track"></span>
      </label>`;
    row.querySelector("input").addEventListener("change", async (e) => {
      enabledModules[key] = e.target.checked;
      applyEnabledModules(enabledModules);
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabledModules }),
      });
    });
    moduleToggleList.appendChild(row);
  });
}

async function loadSettings() {
  const res = await fetch("/api/settings");
  const settings = await res.json();
  applyEnabledModules(settings.enabledModules);
  renderModuleToggles(settings.enabledModules);
}

// ---- 목표 + AI 도우미 ----

const goalEls = {
  empty: document.getElementById("goalEmpty"),
  filled: document.getElementById("goalFilled"),
  setBtn: document.getElementById("goalSetBtn"),
  editBtn: document.getElementById("goalEditBtn"),
  title: document.getElementById("goalTitle"),
  progressBar: document.getElementById("goalProgressBar"),
  milestones: document.getElementById("goalMilestones"),
  companionAvatar: document.getElementById("companionAvatar"),
  companionBubble: document.getElementById("companionBubble"),

  overlay: document.getElementById("goalEditOverlay"),
  close: document.getElementById("goalEditClose"),
  titleInput: document.getElementById("goalTitleInput"),
  targetDateInput: document.getElementById("goalTargetDateInput"),
  noteInput: document.getElementById("goalNoteInput"),
  saveBtn: document.getElementById("goalSaveBtn"),
  milestonesSection: document.getElementById("goalEditMilestones"),
  milestoneList: document.getElementById("milestoneList"),
  newMilestoneText: document.getElementById("newMilestoneText"),
  addMilestoneBtn: document.getElementById("addMilestoneBtn"),
  completeBtn: document.getElementById("goalCompleteBtn"),
  deleteBtn: document.getElementById("goalDeleteBtn"),
  status: document.getElementById("goalStatus"),

  behaviorEnabled: document.getElementById("goalBehaviorEnabled"),
  behaviorFields: document.getElementById("goalBehaviorFields"),
  behaviorTime: document.getElementById("goalBehaviorTime"),
  behaviorTimezone: document.getElementById("goalBehaviorTimezone"),
};

goalEls.behaviorEnabled.addEventListener("change", () => {
  goalEls.behaviorFields.hidden = !goalEls.behaviorEnabled.checked;
});

let currentGoal = null;

function renderMilestoneRow(container, milestone, onToggle, onDelete) {
  const row = document.createElement("div");
  row.className = "checklist-item" + (milestone.done ? " done" : "");
  row.innerHTML = `<input type="checkbox" ${milestone.done ? "checked" : ""}><span>${escapeHtml(milestone.text)}</span><button class="icon-btn" aria-label="삭제">✕</button>`;
  row.querySelector('input[type="checkbox"]').addEventListener("change", (e) => onToggle(milestone.id, e.target.checked));
  row.querySelector(".icon-btn").addEventListener("click", () => onDelete(milestone.id));
  container.appendChild(row);
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function toggleMilestone(id, done) {
  const res = await fetch(`/api/goals/milestones/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ done }),
  });
  currentGoal = await res.json();
  renderGoalCard();
  renderMilestoneEditor();
}

async function deleteMilestone(id) {
  const res = await fetch(`/api/goals/milestones/${id}`, { method: "DELETE" });
  currentGoal = await res.json();
  renderGoalCard();
  renderMilestoneEditor();
}

async function renderGoalCard() {
  if (!currentGoal) {
    goalEls.empty.hidden = false;
    goalEls.filled.hidden = true;
    return;
  }
  goalEls.empty.hidden = true;
  goalEls.filled.hidden = false;
  goalEls.title.textContent = currentGoal.title;

  const total = currentGoal.milestones.length;
  const done = currentGoal.milestones.filter((m) => m.done).length;
  goalEls.progressBar.style.width = total > 0 ? `${Math.round((done / total) * 100)}%` : "0%";

  goalEls.milestones.innerHTML = "";
  if (total === 0) {
    goalEls.milestones.innerHTML = '<p class="hint">수정 버튼을 눌러 단계를 추가해보세요.</p>';
  } else {
    currentGoal.milestones.forEach((m) => renderMilestoneRow(goalEls.milestones, m, toggleMilestone, deleteMilestone));
  }

  const checklistRes = await fetch(`/api/checklist/${todayKey}`);
  const checklistToday = await checklistRes.json();
  const { emoji, message } = buildCompanionMessage(currentGoal, checklistToday);
  goalEls.companionAvatar.textContent = emoji;
  goalEls.companionBubble.textContent = message;
}

function renderMilestoneEditor() {
  goalEls.milestoneList.innerHTML = "";
  if (!currentGoal || currentGoal.milestones.length === 0) {
    goalEls.milestoneList.innerHTML = '<p class="hint">아직 단계가 없어요.</p>';
    return;
  }
  currentGoal.milestones.forEach((m) => renderMilestoneRow(goalEls.milestoneList, m, toggleMilestone, deleteMilestone));
}

async function loadGoal() {
  currentGoal = await (await fetch("/api/goals")).json();
  await renderGoalCard();
}

function openGoalModal() {
  goalEls.status.textContent = "";
  if (currentGoal) {
    goalEls.titleInput.value = currentGoal.title;
    goalEls.targetDateInput.value = currentGoal.targetDate || "";
    goalEls.noteInput.value = currentGoal.note || "";
    goalEls.milestonesSection.hidden = false;
    renderMilestoneEditor();

    const behavior = currentGoal.behavior || {};
    goalEls.behaviorEnabled.checked = Boolean(behavior.enabled);
    goalEls.behaviorFields.hidden = !behavior.enabled;
    goalEls.behaviorTime.value = behavior.time || "";
    goalEls.behaviorTimezone.value = behavior.timezone || "Asia/Seoul";
  } else {
    goalEls.titleInput.value = "";
    goalEls.targetDateInput.value = "";
    goalEls.noteInput.value = "";
    goalEls.milestonesSection.hidden = true;

    goalEls.behaviorEnabled.checked = false;
    goalEls.behaviorFields.hidden = true;
    goalEls.behaviorTime.value = "";
    goalEls.behaviorTimezone.value = "Asia/Seoul";
  }
  goalEls.overlay.hidden = false;
}

goalEls.setBtn.addEventListener("click", openGoalModal);
goalEls.editBtn.addEventListener("click", openGoalModal);
goalEls.close.addEventListener("click", () => (goalEls.overlay.hidden = true));
goalEls.overlay.addEventListener("click", (e) => {
  if (e.target === goalEls.overlay) goalEls.overlay.hidden = true;
});

goalEls.saveBtn.addEventListener("click", async () => {
  const title = goalEls.titleInput.value.trim();
  if (!title) return;

  const behaviorEnabled = goalEls.behaviorEnabled.checked;
  if (behaviorEnabled && !goalEls.behaviorTime.value) {
    goalEls.status.textContent = "리마인더 시간을 입력하세요";
    return;
  }

  const body = {
    title,
    targetDate: goalEls.targetDateInput.value || null,
    note: goalEls.noteInput.value,
  };

  if (currentGoal) {
    const res = await fetch("/api/goals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    currentGoal = await res.json();
  } else {
    const res = await fetch("/api/goals", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    currentGoal = await res.json();
    goalEls.milestonesSection.hidden = false;
    renderMilestoneEditor();
  }

  const behaviorRes = await fetch("/api/goals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      behavior: {
        enabled: behaviorEnabled,
        time: goalEls.behaviorTime.value || null,
        timezone: goalEls.behaviorTimezone.value,
      },
    }),
  });
  currentGoal = await behaviorRes.json();

  goalEls.status.textContent = "저장됨 ✓";
  renderGoalCard();
  document.dispatchEvent(new CustomEvent("lifeapp:goal-updated", { detail: currentGoal }));
});

goalEls.addMilestoneBtn.addEventListener("click", async () => {
  const text = goalEls.newMilestoneText.value.trim();
  if (!text || !currentGoal) return;
  const res = await fetch("/api/goals/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  currentGoal = await res.json();
  goalEls.newMilestoneText.value = "";
  renderMilestoneEditor();
  renderGoalCard();
});
goalEls.newMilestoneText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") goalEls.addMilestoneBtn.click();
});

goalEls.completeBtn.addEventListener("click", async () => {
  if (!currentGoal) return;
  const res = await fetch("/api/goals", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ completed: true }),
  });
  currentGoal = await res.json();
  goalEls.overlay.hidden = true;
  renderGoalCard();
  document.dispatchEvent(new CustomEvent("lifeapp:goal-updated", { detail: currentGoal }));
});

goalEls.deleteBtn.addEventListener("click", async () => {
  if (!currentGoal) return;
  if (!confirm("목표를 삭제할까요?")) return;
  const deletedGoal = currentGoal;
  await fetch("/api/goals", { method: "DELETE" });
  currentGoal = null;
  goalEls.overlay.hidden = true;
  renderGoalCard();
  document.dispatchEvent(new CustomEvent("lifeapp:goal-updated", { detail: deletedGoal }));
});

loadSettings();
loadGoal();
