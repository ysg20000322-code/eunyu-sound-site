const state = { date: new Date() };

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

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const els = {
  dateLabel: document.getElementById("currentDateLabel"),
  prevDay: document.getElementById("prevDay"),
  nextDay: document.getElementById("nextDay"),
  todayBtn: document.getElementById("todayBtn"),
  diaryText: document.getElementById("diaryText"),
  saveBtn: document.getElementById("saveBtn"),
  saveStatus: document.getElementById("saveStatus"),
  diaryHistory: document.getElementById("diaryHistory"),
};

async function loadDay() {
  const key = fmtDate(state.date);
  els.dateLabel.textContent = fmtLabel(state.date);
  els.saveStatus.textContent = "";
  const res = await fetch(`/api/diary/${key}`);
  const entry = await res.json();
  els.diaryText.value = entry ? entry.text : "";
}

async function saveDay() {
  const key = fmtDate(state.date);
  await fetch(`/api/diary/${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: els.diaryText.value }),
  });
  els.saveStatus.textContent = "저장됨 ✓";
  renderHistory();
}

async function renderHistory() {
  const res = await fetch("/api/diary");
  const all = await res.json();
  const dates = Object.keys(all).sort().reverse().slice(0, 10);
  els.diaryHistory.innerHTML = "";
  if (dates.length === 0) {
    els.diaryHistory.innerHTML = '<p class="hint">아직 작성한 일기가 없어요.</p>';
    return;
  }
  for (const key of dates) {
    const [y, m, d] = key.split("-").map(Number);
    const label = fmtLabel(new Date(y, m - 1, d));
    const preview = all[key].text.length > 40 ? all[key].text.slice(0, 40) + "…" : all[key].text;
    const row = document.createElement("div");
    row.className = "history-row";
    row.innerHTML = `<span class="history-date">${label}</span><span class="history-summary">${escapeHtml(preview)}</span>`;
    els.diaryHistory.appendChild(row);
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

loadDay();
renderHistory();
