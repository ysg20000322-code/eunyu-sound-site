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
