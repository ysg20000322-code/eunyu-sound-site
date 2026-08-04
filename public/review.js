function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}

// ---------- add form: dynamic choice rows ----------
const choiceRowsEl = document.getElementById("choiceRows");

function addChoiceRow(value = "", checked = false) {
  const row = document.createElement("div");
  row.className = "choice-row";
  row.innerHTML = `
    <input type="radio" name="answerChoice" class="choice-radio" ${checked ? "checked" : ""}>
    <input type="text" class="choice-text" placeholder="선택지 내용">
    <button type="button" class="icon-btn choice-remove" aria-label="선택지 삭제">✕</button>
  `;
  row.querySelector(".choice-text").value = value;
  row.querySelector(".choice-remove").addEventListener("click", () => {
    if (choiceRowsEl.children.length <= 2) return;
    row.remove();
  });
  choiceRowsEl.appendChild(row);
}

for (let i = 0; i < 4; i++) addChoiceRow();

document.getElementById("addChoiceBtn").addEventListener("click", () => addChoiceRow());

// ---------- add note ----------
const addStatus = document.getElementById("addStatus");

document.getElementById("addBtn").addEventListener("click", async () => {
  const question = document.getElementById("fQuestion").value.trim();
  if (!question) {
    addStatus.textContent = "문제 내용은 필수예요";
    return;
  }

  const choiceRows = [...choiceRowsEl.children];
  const choices = choiceRows.map((r) => r.querySelector(".choice-text").value.trim());
  const answerIdx = choiceRows.findIndex((r) => r.querySelector(".choice-radio").checked);

  const nonEmptyChoices = choices.filter(Boolean);
  if (nonEmptyChoices.length < 2) {
    addStatus.textContent = "선택지를 2개 이상 입력하세요";
    return;
  }
  if (answerIdx === -1 || !choices[answerIdx]) {
    addStatus.textContent = "정답 선택지를 라디오 버튼으로 선택하세요";
    return;
  }

  // reindex answer against filtered non-empty choices
  const filteredAnswerIndex = choices.slice(0, answerIdx).filter(Boolean).length;

  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: document.getElementById("fSubject").value.trim(),
      source: document.getElementById("fSource").value.trim(),
      question,
      context: document.getElementById("fContext").value.trim(),
      choices: nonEmptyChoices,
      answerIndex: filteredAnswerIndex,
      explanation: document.getElementById("fExplanation").value.trim(),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    addStatus.textContent = err.error || "추가 실패";
    return;
  }

  const saved = await res.json().catch(() => null);

  document.getElementById("fSubject").value = "";
  document.getElementById("fSource").value = "";
  document.getElementById("fQuestion").value = "";
  document.getElementById("fContext").value = "";
  document.getElementById("fExplanation").value = "";
  choiceRowsEl.innerHTML = "";
  for (let i = 0; i < 4; i++) addChoiceRow();

  addStatus.textContent = saved && saved.duplicate ? "이미 등록된 문제예요 (중복 건너뜀)" : "추가됨 ✓";
  setTimeout(() => (addStatus.textContent = ""), 2500);

  await loadAll();
});

// ---------- list ----------
async function loadList(notes) {
  const listEl = document.getElementById("noteList");
  document.getElementById("listCount").textContent = notes.length;
  listEl.innerHTML = "";

  if (notes.length === 0) {
    listEl.innerHTML = '<p class="hint">아직 등록된 문제가 없어요.</p>';
    return;
  }

  for (const n of notes) {
    const total = (n.stats?.correct || 0) + (n.stats?.wrong || 0);
    const rate = total > 0 ? Math.round(((n.stats.correct || 0) / total) * 100) : null;

    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
      <div class="activity-item-head">
        <span class="activity-item-name">${escapeHtml(n.question).slice(0, 60)}${n.question.length > 60 ? "…" : ""}</span>
        <span class="activity-item-period">${rate === null ? "기록 없음" : `정답률 ${rate}%`}</span>
      </div>
      ${n.subject ? `<div class="activity-item-role">${escapeHtml(n.subject)}</div>` : ""}
      ${n.source ? `<div class="activity-item-field">${escapeHtml(n.source)}</div>` : ""}
      <div class="activity-item-field">선택지 ${n.choices.length}개 · 정답: ${escapeHtml(n.choices[n.answerIndex] || "")}</div>
      <div class="activity-actions">
        <button class="btn-secondary note-toggle" data-id="${n.id}">해설 보기</button>
        <button class="btn-danger note-delete" data-id="${n.id}">삭제</button>
      </div>
      <div class="note-detail" id="detail-${n.id}" hidden>
        ${n.context ? `<div class="quiz-context">${nl2br(n.context)}</div>` : ""}
        <div class="quiz-explanation">${n.explanation ? nl2br(n.explanation) : "등록된 해설이 없어요."}</div>
      </div>
    `;
    item.querySelector(".note-toggle").addEventListener("click", () => {
      const detail = item.querySelector(".note-detail");
      detail.hidden = !detail.hidden;
    });
    item.querySelector(".note-delete").addEventListener("click", () => deleteNote(n.id));
    listEl.appendChild(item);
  }
}

async function deleteNote(id) {
  if (!confirm("이 문제를 삭제할까요?")) return;
  await fetch(`/api/review/${id}`, { method: "DELETE" });
  await loadAll();
}

// ---------- subject filter ----------
const subjectFilterEl = document.getElementById("subjectFilter");
const subjectListEl = document.getElementById("subjectList");

function renderSubjectOptions(notes) {
  const subjects = [...new Set(notes.map((n) => n.subject).filter(Boolean))].sort();
  const prevValue = subjectFilterEl.value;

  subjectFilterEl.innerHTML = '<option value="">전체</option>';
  subjectListEl.innerHTML = "";
  for (const s of subjects) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    subjectFilterEl.appendChild(opt);

    const dOpt = document.createElement("option");
    dOpt.value = s;
    subjectListEl.appendChild(dOpt);
  }
  if (subjects.includes(prevValue)) subjectFilterEl.value = prevValue;
}

// ---------- quiz ----------
let allNotes = [];
let quizQueue = [];
let quizIndex = 0;
let quizCorrect = 0;
let quizWrongIds = [];
let quizAnswered = false;

const quizEmpty = document.getElementById("quizEmpty");
const quizArea = document.getElementById("quizArea");
const quizDone = document.getElementById("quizDone");

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function currentScope() {
  const subject = subjectFilterEl.value;
  return subject ? allNotes.filter((n) => n.subject === subject) : allNotes;
}

function startQuiz(notes) {
  quizQueue = shuffle(notes);
  quizIndex = 0;
  quizCorrect = 0;
  quizWrongIds = [];
  quizDone.hidden = true;

  if (quizQueue.length === 0) {
    quizEmpty.hidden = false;
    quizArea.hidden = true;
    return;
  }
  quizEmpty.hidden = true;
  quizArea.hidden = false;
  renderQuizQuestion();
}

function renderQuizQuestion() {
  quizAnswered = false;
  const n = quizQueue[quizIndex];
  document.getElementById("quizProgress").textContent = `${quizIndex + 1} / ${quizQueue.length}`;
  document.getElementById("quizScore").textContent = `맞은 개수: ${quizCorrect}`;
  document.getElementById("quizSource").textContent = [n.subject, n.source].filter(Boolean).join(" · ");
  document.getElementById("quizQuestion").textContent = n.question;

  const contextEl = document.getElementById("quizContext");
  if (n.context) {
    contextEl.innerHTML = nl2br(n.context);
    contextEl.hidden = false;
  } else {
    contextEl.hidden = true;
  }

  const explEl = document.getElementById("quizExplanation");
  explEl.hidden = true;
  explEl.innerHTML = "";

  document.getElementById("quizNextBtn").hidden = true;

  const choicesEl = document.getElementById("quizChoices");
  choicesEl.innerHTML = "";
  n.choices.forEach((choice, idx) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "quiz-choice";
    btn.textContent = choice;
    btn.addEventListener("click", () => selectChoice(n, idx, btn));
    choicesEl.appendChild(btn);
  });
}

async function selectChoice(note, idx, btn) {
  if (quizAnswered) return;
  quizAnswered = true;

  const correct = idx === note.answerIndex;
  const choicesEl = document.getElementById("quizChoices");
  [...choicesEl.children].forEach((el, i) => {
    el.classList.add("disabled");
    if (i === note.answerIndex) el.classList.add("correct");
  });
  if (!correct) btn.classList.add("wrong");

  if (correct) quizCorrect += 1;
  else quizWrongIds.push(note.id);

  const explEl = document.getElementById("quizExplanation");
  explEl.hidden = false;
  explEl.innerHTML = `<strong>${correct ? "정답이에요! ✓" : "틀렸어요 ✗"}</strong><br>${note.explanation ? nl2br(note.explanation) : "등록된 해설이 없어요."}`;

  document.getElementById("quizScore").textContent = `맞은 개수: ${quizCorrect}`;
  document.getElementById("quizNextBtn").hidden = false;

  fetch(`/api/review/${note.id}/attempt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correct }),
  }).catch(() => {});
}

document.getElementById("quizNextBtn").addEventListener("click", () => {
  quizIndex += 1;
  if (quizIndex >= quizQueue.length) {
    quizArea.hidden = true;
    quizDone.hidden = false;
    document.getElementById("quizResult").textContent = `${quizQueue.length}문제 중 ${quizCorrect}개 정답! (${Math.round((quizCorrect / quizQueue.length) * 100)}%)`;
    const retryWrongBtn = document.getElementById("quizRetryWrong");
    retryWrongBtn.hidden = quizWrongIds.length === 0;
  } else {
    renderQuizQuestion();
  }
});

document.getElementById("quizRetryAll").addEventListener("click", () => startQuiz(currentScope()));
document.getElementById("quizRetryWrong").addEventListener("click", () => {
  const wrongNotes = allNotes.filter((n) => quizWrongIds.includes(n.id));
  startQuiz(wrongNotes);
});
document.getElementById("startBtn").addEventListener("click", () => startQuiz(currentScope()));

// ---------- load everything ----------
async function loadAll() {
  const res = await fetch("/api/review");
  allNotes = await res.json();
  renderSubjectOptions(allNotes);
  await loadList(allNotes);
  startQuiz(currentScope());
}

loadAll();
