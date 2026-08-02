const els = {
  fName: document.getElementById("fName"),
  fPeriod: document.getElementById("fPeriod"),
  fRole: document.getElementById("fRole"),
  fDetail: document.getElementById("fDetail"),
  fRecord: document.getElementById("fRecord"),
  fNote: document.getElementById("fNote"),
  addBtn: document.getElementById("addBtn"),
  addStatus: document.getElementById("addStatus"),
  list: document.getElementById("activityList"),
};

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function loadActivities() {
  const res = await fetch("/api/activities");
  const list = await res.json();
  els.list.innerHTML = "";
  if (list.length === 0) {
    els.list.innerHTML = '<p class="hint">아직 등록된 활동이 없어요.</p>';
    return;
  }
  for (const a of list) {
    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
      <div class="activity-item-head">
        <span class="activity-item-name">${escapeHtml(a.name)}</span>
        <span class="activity-item-period">${escapeHtml(a.period || "")}</span>
      </div>
      ${a.role ? `<div class="activity-item-role">${escapeHtml(a.role)}</div>` : ""}
      ${a.detail ? `<div class="activity-item-detail">${escapeHtml(a.detail)}</div>` : ""}
      ${a.record ? `<div class="activity-item-field">📁 기록: ${escapeHtml(a.record)}</div>` : ""}
      ${a.note ? `<div class="activity-item-field">📝 ${escapeHtml(a.note)}</div>` : ""}
      <div class="activity-actions">
        <button class="btn-danger" data-id="${a.id}">삭제</button>
      </div>
    `;
    item.querySelector(".btn-danger").addEventListener("click", () => deleteActivity(a.id));
    els.list.appendChild(item);
  }
}

async function deleteActivity(id) {
  if (!confirm("이 활동을 삭제할까요?")) return;
  await fetch(`/api/activities/${id}`, { method: "DELETE" });
  loadActivities();
}

els.addBtn.addEventListener("click", async () => {
  const name = els.fName.value.trim();
  if (!name) {
    els.addStatus.textContent = "활동명은 필수예요";
    return;
  }
  await fetch("/api/activities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      period: els.fPeriod.value.trim(),
      role: els.fRole.value.trim(),
      detail: els.fDetail.value.trim(),
      record: els.fRecord.value.trim(),
      note: els.fNote.value.trim(),
    }),
  });
  els.fName.value = "";
  els.fPeriod.value = "";
  els.fRole.value = "";
  els.fDetail.value = "";
  els.fRecord.value = "";
  els.fNote.value = "";
  els.addStatus.textContent = "추가됨 ✓";
  setTimeout(() => (els.addStatus.textContent = ""), 2000);
  loadActivities();
});

loadActivities();
