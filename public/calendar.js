const state = {
  view: (() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() }; // month: 0-11
  })(),
  selectedDate: null,
  eventsCache: {},
};

const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const els = {
  calTitle: document.getElementById("calTitle"),
  calDow: document.getElementById("calDow"),
  calGrid: document.getElementById("calGrid"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  modalOverlay: document.getElementById("modalOverlay"),
  modalClose: document.getElementById("modalClose"),
  modalDate: document.getElementById("modalDate"),
  modalEventList: document.getElementById("modalEventList"),
  modalEventEmpty: document.getElementById("modalEventEmpty"),
  newEventTime: document.getElementById("newEventTime"),
  newEventTitle: document.getElementById("newEventTitle"),
  addEventBtn: document.getElementById("addEventBtn"),
  goCheckin: document.getElementById("goCheckin"),
};

function pad2(n) {
  return String(n).padStart(2, "0");
}

function monthKey(year, month) {
  return `${year}-${pad2(month + 1)}`;
}

function dateKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

for (const d of DOW) {
  const cell = document.createElement("div");
  cell.className = "cal-dow";
  cell.textContent = d;
  els.calDow.appendChild(cell);
}

async function loadMonth() {
  const { year, month } = state.view;
  els.calTitle.textContent = `${year}년 ${month + 1}월`;

  const res = await fetch(`/api/events?month=${monthKey(year, month)}`);
  state.eventsCache = await res.json();
  renderGrid();
}

function renderGrid() {
  const { year, month } = state.view;
  els.calGrid.innerHTML = "";

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const todayKey = dateKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  const cells = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, otherMonth: true, y: month === 0 ? year - 1 : year, m: month === 0 ? 11 : month - 1 });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, otherMonth: false, y: year, m: month });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1];
    const nextDay = last.otherMonth === false && last.m === month ? 1 : last.day + 1;
    cells.push({
      day: cells.length >= daysInMonth + firstDow ? cells.length - (daysInMonth + firstDow) + 1 : nextDay,
      otherMonth: true,
      y: month === 11 ? year + 1 : year,
      m: month === 11 ? 0 : month + 1,
    });
    if (cells.length >= 42) break;
  }

  for (const c of cells) {
    const key = dateKey(c.y, c.m, c.day);
    const cell = document.createElement("div");
    cell.className = "cal-cell";
    if (c.otherMonth) cell.classList.add("other-month");
    if (key === todayKey) cell.classList.add("today");

    const events = state.eventsCache[key] || [];
    cell.innerHTML = `<span>${c.day}</span>${events.length ? '<span class="cal-dot"></span>' : ""}`;
    cell.addEventListener("click", () => openModal(key));
    els.calGrid.appendChild(cell);
  }
}

async function openModal(key) {
  state.selectedDate = key;
  const [y, m, d] = key.split("-").map(Number);
  const dow = DOW[new Date(y, m - 1, d).getDay()];
  els.modalDate.textContent = `${y}.${m}.${d} (${dow})`;
  els.goCheckin.href = `/?date=${key}`;
  els.newEventTime.value = "";
  els.newEventTitle.value = "";
  await renderModalEvents();
  els.modalOverlay.hidden = false;
}

async function renderModalEvents() {
  const res = await fetch(`/api/events/${state.selectedDate}`);
  const events = await res.json();
  els.modalEventList.innerHTML = "";
  if (events.length === 0) {
    els.modalEventEmpty.hidden = false;
  } else {
    els.modalEventEmpty.hidden = true;
    events.forEach((ev, idx) => {
      const row = document.createElement("div");
      row.className = "event-pill";
      row.innerHTML = `<span>${escapeHtml(ev.title)}</span><span class="event-time">${escapeHtml(ev.time || "")} <button class="icon-btn" data-idx="${idx}" aria-label="삭제">✕</button></span>`;
      row.querySelector(".icon-btn").addEventListener("click", () => deleteEvent(idx));
      els.modalEventList.appendChild(row);
    });
  }
  state.eventsCache[state.selectedDate] = events;
}

async function deleteEvent(idx) {
  await fetch(`/api/events/${state.selectedDate}/${idx}`, { method: "DELETE" });
  await renderModalEvents();
  renderGrid();
}

els.addEventBtn.addEventListener("click", async () => {
  const title = els.newEventTitle.value.trim();
  if (!title) return;
  await fetch(`/api/events/${state.selectedDate}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, time: els.newEventTime.value }),
  });
  els.newEventTitle.value = "";
  els.newEventTime.value = "";
  await renderModalEvents();
  renderGrid();
});

els.modalClose.addEventListener("click", () => (els.modalOverlay.hidden = true));
els.modalOverlay.addEventListener("click", (e) => {
  if (e.target === els.modalOverlay) els.modalOverlay.hidden = true;
});

els.prevMonth.addEventListener("click", () => {
  state.view.month -= 1;
  if (state.view.month < 0) { state.view.month = 11; state.view.year -= 1; }
  loadMonth();
});
els.nextMonth.addEventListener("click", () => {
  state.view.month += 1;
  if (state.view.month > 11) { state.view.month = 0; state.view.year += 1; }
  loadMonth();
});

loadMonth();
