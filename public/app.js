const params = new URLSearchParams(location.search);
const initialDate = params.get("date");
const state = { date: initialDate ? new Date(initialDate + "T00:00:00") : new Date() };

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtLabel(d) {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} (${days[d.getDay()]})`;
}

function isSameDay(a, b) {
  return fmtDate(a) === fmtDate(b);
}

const els = {
  dateLabel: document.getElementById("currentDateLabel"),
  prevDay: document.getElementById("prevDay"),
  nextDay: document.getElementById("nextDay"),
  todayBtn: document.getElementById("todayBtn"),
  planNote: document.getElementById("planNote"),
  drinkCount: document.getElementById("drinkCount"),
  exerciseDone: document.getElementById("exerciseDone"),
  exerciseNote: document.getElementById("exerciseNote"),
  postureNeck: document.getElementById("postureNeck"),
  posturePushup: document.getElementById("posturePushup"),
  novelDone: document.getElementById("novelDone"),
  novelNote: document.getElementById("novelNote"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  history: document.getElementById("history"),
  eventList: document.getElementById("eventList"),
  eventEmpty: document.getElementById("eventEmpty"),
  coachText: document.getElementById("coachText"),
  checklist: document.getElementById("checklist"),
  newChecklistText: document.getElementById("newChecklistText"),
  addChecklistBtn: document.getElementById("addChecklistBtn"),
  diaryQuickText: document.getElementById("diaryQuickText"),
  diaryQuickSaveBtn: document.getElementById("diaryQuickSaveBtn"),
  diaryQuickStatus: document.getElementById("diaryQuickStatus"),
};

function clearForm() {
  els.planNote.value = "";
  els.drinkCount.value = "";
  els.exerciseDone.checked = false;
  els.exerciseNote.value = "";
  els.postureNeck.checked = false;
  els.posturePushup.checked = false;
  els.novelDone.checked = false;
  els.novelNote.value = "";
}

function fillForm(entry) {
  clearForm();
  if (!entry) return;
  els.planNote.value = entry.planNote || "";
  els.drinkCount.value = entry.drinkCount ?? "";
  els.exerciseDone.checked = !!entry.exerciseDone;
  els.exerciseNote.value = entry.exerciseNote || "";
  els.postureNeck.checked = !!entry.postureNeck;
  els.posturePushup.checked = !!entry.posturePushup;
  els.novelDone.checked = !!entry.novelDone;
  els.novelNote.value = entry.novelNote || "";
}

function renderEvents(events) {
  els.eventList.innerHTML = "";
  if (!events || events.length === 0) {
    els.eventEmpty.hidden = false;
    return;
  }
  els.eventEmpty.hidden = true;
  for (const ev of events) {
    const row = document.createElement("div");
    row.className = "event-pill";
    row.innerHTML = `<span>${escapeHtml(ev.title)}</span><span class="event-time">${escapeHtml(ev.time || "")}</span>`;
    els.eventList.appendChild(row);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const DRINK_KEYWORDS = ["술", "모임", "정모", "회식", "MT", "생일", "축하"];

function buildCoachMessage(events, entry, today) {
  const titles = events.map((e) => e.title).join(" ");
  const hasDrinkEvent = DRINK_KEYWORDS.some((k) => titles.includes(k));

  if (!today) {
    return entry
      ? "지난 기록을 보고 계세요. 오늘로 돌아가려면 위의 '오늘' 버튼을 눌러주세요."
      : "지난 날짜에는 기록이 없어요. 오늘로 돌아가려면 위의 '오늘' 버튼을 눌러주세요.";
  }

  if (hasDrinkEvent && (!entry || entry.drinkCount == null)) {
    return "오늘 일정에 술자리로 보이는 일정이 있네요. 이따 몇 잔 마셨는지 잊지 말고 기록해주세요 🍺";
  }

  if (!entry) {
    return "아직 오늘 체크인을 안 하셨네요. 운동·자세교정·소설쓰기 중 하나라도 하셨다면 체크해보세요!";
  }

  const missing = [];
  if (!entry.exerciseDone) missing.push("운동");
  if (!entry.postureNeck && !entry.posturePushup) missing.push("자세교정");
  if (!entry.novelDone) missing.push("소설 쓰기");

  if (missing.length === 0) return "오늘 목표를 전부 체크하셨네요! 완벽합니다 🎉";
  return `아직 ${missing.join(", ")} 체크가 안 됐어요. 오늘 하셨다면 잊지 말고 기록해주세요.`;
}

function renderChecklist(items) {
  els.checklist.innerHTML = "";
  if (!items || items.length === 0) {
    els.checklist.innerHTML = '<p class="hint">오늘의 할 일을 추가해보세요.</p>';
    return;
  }
  const key = fmtDate(state.date);
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "checklist-item" + (item.done ? " done" : "");
    row.innerHTML = `<input type="checkbox" ${item.done ? "checked" : ""}><span>${escapeHtml(item.text)}</span><button class="icon-btn" aria-label="삭제">✕</button>`;
    row.querySelector('input[type="checkbox"]').addEventListener("change", async (e) => {
      await fetch(`/api/checklist/${key}/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: e.target.checked }),
      });
      loadChecklist();
    });
    row.querySelector(".icon-btn").addEventListener("click", async () => {
      await fetch(`/api/checklist/${key}/${item.id}`, { method: "DELETE" });
      loadChecklist();
    });
    els.checklist.appendChild(row);
  }
}

async function loadChecklist() {
  const key = fmtDate(state.date);
  const res = await fetch(`/api/checklist/${key}`);
  renderChecklist(await res.json());
}

async function loadDiaryQuick() {
  const key = fmtDate(state.date);
  const res = await fetch(`/api/diary/${key}`);
  const entry = await res.json();
  els.diaryQuickText.value = entry ? entry.text : "";
  els.diaryQuickStatus.textContent = "";
}

async function loadDay() {
  const key = fmtDate(state.date);
  els.dateLabel.textContent = fmtLabel(state.date);
  els.saveStatus.textContent = "";

  const [checkinRes, eventsRes] = await Promise.all([
    fetch(`/api/checkins/${key}`),
    fetch(`/api/events/${key}`),
  ]);
  const entry = await checkinRes.json();
  const events = await eventsRes.json();

  fillForm(entry);
  renderEvents(events);
  els.coachText.textContent = buildCoachMessage(events, entry, isSameDay(state.date, new Date()));

  loadChecklist();
  loadDiaryQuick();
}

async function saveDay() {
  const key = fmtDate(state.date);
  const body = {
    planNote: els.planNote.value,
    drinkCount: els.drinkCount.value === "" ? null : Number(els.drinkCount.value),
    exerciseDone: els.exerciseDone.checked,
    exerciseNote: els.exerciseNote.value,
    postureNeck: els.postureNeck.checked,
    posturePushup: els.posturePushup.checked,
    novelDone: els.novelDone.checked,
    novelNote: els.novelNote.value,
  };
  await fetch(`/api/checkins/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  els.saveStatus.textContent = "저장됨 ✓";
  renderHistory();
  loadDay();
}

function summarize(entry) {
  if (!entry) return "기록 없음";
  const parts = [];
  if (entry.drinkCount != null && entry.drinkCount !== "") parts.push(`술 ${entry.drinkCount}잔`);
  if (entry.exerciseDone) parts.push("운동 ✓");
  if (entry.postureNeck) parts.push("거북목 ✓");
  if (entry.posturePushup) parts.push("팔굽혀펴기 ✓");
  if (entry.novelDone) parts.push("소설 ✓");
  return parts.length ? parts.join(" · ") : "체크 없음";
}

async function renderHistory() {
  const res = await fetch("/api/checkins");
  const all = await res.json();
  els.history.innerHTML = "";
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = fmtDate(d);
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `<span class="history-date">${fmtLabel(d)}</span><span class="history-summary">${summarize(all[key])}</span>`;
    els.history.appendChild(row);
  }
}

els.prevDay.addEventListener("click", () => {
  state.date.setDate(state.date.getDate() - 1);
  loadDay();
});
els.nextDay.addEventListener("click", () => {
  state.date.setDate(state.date.getDate() + 1);
  loadDay();
});
els.todayBtn.addEventListener("click", () => {
  state.date = new Date();
  loadDay();
});
els.saveBtn.addEventListener("click", saveDay);

els.addChecklistBtn.addEventListener("click", async () => {
  const text = els.newChecklistText.value.trim();
  if (!text) return;
  const key = fmtDate(state.date);
  await fetch(`/api/checklist/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  els.newChecklistText.value = "";
  loadChecklist();
});
els.newChecklistText.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.addChecklistBtn.click();
});

els.diaryQuickSaveBtn.addEventListener("click", async () => {
  const key = fmtDate(state.date);
  await fetch(`/api/diary/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: els.diaryQuickText.value }),
  });
  els.diaryQuickStatus.textContent = "저장됨 ✓";
});

loadDay();
renderHistory();
