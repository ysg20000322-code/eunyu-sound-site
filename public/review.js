function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}

function examLabelOf(n) {
  const parts = [];
  if (n.examLabel) parts.push(n.examLabel);
  else if (n.examDate) parts.push(n.examDate);
  if (n.questionNumber != null) parts.push(`${n.questionNumber}번`);
  return parts.join(" · ");
}

// ---------- subjects ----------
let subjects = [];

async function loadSubjects() {
  const res = await fetch("/api/review/subjects");
  subjects = await res.json();

  const fillSelect = (el, withPlaceholder) => {
    const prev = el.value;
    el.innerHTML = "";
    if (withPlaceholder) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = withPlaceholder;
      el.appendChild(opt);
    }
    for (const s of subjects) {
      const opt = document.createElement("option");
      opt.value = s;
      opt.textContent = s;
      el.appendChild(opt);
    }
    if ([...el.options].some((o) => o.value === prev)) el.value = prev;
  };

  fillSelect(document.getElementById("subjectFilter"), "과목 선택");
  fillSelect(document.getElementById("listSubjectFilter"), "전체");
  fillSelect(document.getElementById("fSubject"), "선택하세요");
  fillSelect(document.getElementById("eSubject"), null);
}

// ---------- choice rows (fixed 4) ----------
function buildChoiceRows(container, radioName) {
  container.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    const row = document.createElement("div");
    row.className = "choice-row";
    row.innerHTML = `
      <input type="radio" name="${radioName}" class="choice-radio" value="${i + 1}">
      <input type="text" class="choice-text" placeholder="선택지 ${i + 1}">
    `;
    container.appendChild(row);
  }
}

function readChoiceRows(container) {
  const rows = [...container.children];
  const choices = rows.map((r) => r.querySelector(".choice-text").value.trim());
  const checked = rows.find((r) => r.querySelector(".choice-radio").checked);
  const correctAnswer = checked ? Number(checked.querySelector(".choice-radio").value) : null;
  return { choices, correctAnswer };
}

function fillChoiceRows(container, choices, correctAnswer) {
  const rows = [...container.children];
  rows.forEach((r, i) => {
    r.querySelector(".choice-text").value = choices[i] || "";
    r.querySelector(".choice-radio").checked = correctAnswer === i + 1;
  });
}

const addChoiceRowsEl = document.getElementById("choiceRows");
const editChoiceRowsEl = document.getElementById("eChoiceRows");
buildChoiceRows(addChoiceRowsEl, "addAnswerChoice");
buildChoiceRows(editChoiceRowsEl, "editAnswerChoice");

// ---------- add note ----------
const addStatus = document.getElementById("addStatus");

document.getElementById("addBtn").addEventListener("click", async () => {
  const question = document.getElementById("fQuestion").value.trim();
  const subject = document.getElementById("fSubject").value;
  const { choices, correctAnswer } = readChoiceRows(addChoiceRowsEl);

  if (!subject) {
    addStatus.textContent = "과목을 선택하세요";
    return;
  }
  if (!question) {
    addStatus.textContent = "문제 내용은 필수예요";
    return;
  }
  if (choices.some((c) => !c)) {
    addStatus.textContent = "선택지 4개를 모두 입력하세요";
    return;
  }
  if (!correctAnswer) {
    addStatus.textContent = "정답 선택지를 라디오 버튼으로 선택하세요";
    return;
  }

  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject,
      examDate: document.getElementById("fExamDate").value || null,
      questionNumber: document.getElementById("fQuestionNumber").value || null,
      examLabel: document.getElementById("fExamLabel").value.trim(),
      question,
      choices,
      correctAnswer,
      explanation: document.getElementById("fExplanation").value.trim(),
      source: "manual",
    }),
  });

  const saved = await res.json().catch(() => null);

  if (!res.ok) {
    addStatus.textContent = (saved && saved.error) || "추가 실패";
    return;
  }

  document.getElementById("fSubject").value = "";
  document.getElementById("fExamDate").value = "";
  document.getElementById("fQuestionNumber").value = "";
  document.getElementById("fExamLabel").value = "";
  document.getElementById("fQuestion").value = "";
  document.getElementById("fExplanation").value = "";
  buildChoiceRows(addChoiceRowsEl, "addAnswerChoice");

  addStatus.textContent = saved && saved.duplicate ? "이미 등록된 문제예요 (오답 횟수만 증가)" : "추가됨 ✓";
  setTimeout(() => (addStatus.textContent = ""), 2500);

  await loadAll();
});

// ---------- edit modal ----------
const editOverlay = document.getElementById("editOverlay");
const eStatus = document.getElementById("eStatus");
let editingId = null;

function openEdit(n) {
  editingId = n.id;
  document.getElementById("eSubject").value = n.subject;
  document.getElementById("eExamDate").value = n.examDate || "";
  document.getElementById("eQuestionNumber").value = n.questionNumber != null ? n.questionNumber : "";
  document.getElementById("eExamLabel").value = n.examLabel || "";
  document.getElementById("eQuestion").value = n.question;
  document.getElementById("eExplanation").value = n.explanation || "";
  fillChoiceRows(editChoiceRowsEl, n.choices, n.correctAnswer);
  eStatus.textContent = "";
  editOverlay.hidden = false;
}

document.getElementById("editClose").addEventListener("click", () => (editOverlay.hidden = true));
editOverlay.addEventListener("click", (e) => {
  if (e.target === editOverlay) editOverlay.hidden = true;
});

document.getElementById("eSaveBtn").addEventListener("click", async () => {
  const { choices, correctAnswer } = readChoiceRows(editChoiceRowsEl);
  const question = document.getElementById("eQuestion").value.trim();

  if (!question || choices.some((c) => !c) || !correctAnswer) {
    eStatus.textContent = "문제, 선택지 4개, 정답을 모두 입력하세요";
    return;
  }

  const res = await fetch(`/api/review/${editingId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: document.getElementById("eSubject").value,
      examDate: document.getElementById("eExamDate").value || null,
      questionNumber: document.getElementById("eQuestionNumber").value || null,
      examLabel: document.getElementById("eExamLabel").value.trim(),
      question,
      choices,
      correctAnswer,
      explanation: document.getElementById("eExplanation").value.trim(),
      source: "manual-edit",
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    eStatus.textContent = err.error || "저장 실패";
    return;
  }

  editOverlay.hidden = true;
  await loadAll();
});

// ---------- list ----------
const listSubjectFilterEl = document.getElementById("listSubjectFilter");
const listImportantOnlyEl = document.getElementById("listImportantOnly");
const listUnmasteredOnlyEl = document.getElementById("listUnmasteredOnly");

function filteredList() {
  return allNotes.filter((n) => {
    if (listSubjectFilterEl.value && n.subject !== listSubjectFilterEl.value) return false;
    if (listImportantOnlyEl.checked && !n.important) return false;
    if (listUnmasteredOnlyEl.checked && n.mastered) return false;
    return true;
  });
}

function renderList() {
  const notes = filteredList();
  const listEl = document.getElementById("noteList");
  document.getElementById("listCount").textContent = notes.length;
  listEl.innerHTML = "";

  if (notes.length === 0) {
    listEl.innerHTML = '<p class="hint">조건에 맞는 문제가 없어요.</p>';
    return;
  }

  for (const n of notes) {
    const rate = n.reviewAttemptCount > 0 ? Math.round((n.reviewCorrectCount / n.reviewAttemptCount) * 100) : null;
    const label = examLabelOf(n);

    const item = document.createElement("div");
    item.className = "activity-item";
    item.innerHTML = `
      <div class="activity-item-head">
        <span class="activity-item-name">${escapeHtml(n.question).slice(0, 60)}${n.question.length > 60 ? "…" : ""}</span>
        <span class="activity-item-period">오답 ${n.externalWrongCount || 0}회</span>
      </div>
      <div class="activity-item-role">${escapeHtml(n.subject)}${label ? " · " + escapeHtml(label) : ""}</div>
      <div class="badge-row">
        ${n.important ? '<span class="badge badge-important">중요</span>' : ""}
        <span class="badge ${n.mastered ? "badge-mastered" : "badge-unmastered"}">${n.mastered ? "숙달" : "미숙달"}</span>
        ${rate !== null ? `<span class="badge">복습 정답률 ${rate}%</span>` : ""}
      </div>
      <div class="activity-actions">
        <button class="btn-secondary note-toggle" data-id="${n.id}">상세보기</button>
        <button class="btn-secondary note-mastered" data-id="${n.id}">${n.mastered ? "미숙달로 표시" : "숙달로 표시"}</button>
        <button class="btn-secondary note-edit" data-id="${n.id}">수정</button>
        <button class="btn-danger note-delete" data-id="${n.id}">삭제</button>
      </div>
      <div class="note-detail" id="detail-${n.id}" hidden>
        <div class="quiz-choices">
          ${n.choices
            .map(
              (c, i) => `<div class="quiz-choice disabled${i + 1 === n.correctAnswer ? " correct" : ""}">${i + 1}. ${escapeHtml(c)}</div>`
            )
            .join("")}
        </div>
        ${n.submittedAnswer ? `<div class="quiz-context">제출했던 답: ${n.submittedAnswer}번</div>` : ""}
        <div class="quiz-explanation">${n.explanation ? nl2br(n.explanation) : "등록된 해설이 없어요."}</div>
      </div>
    `;
    item.querySelector(".note-toggle").addEventListener("click", () => {
      const detail = item.querySelector(".note-detail");
      detail.hidden = !detail.hidden;
    });
    item.querySelector(".note-edit").addEventListener("click", () => openEdit(n));
    item.querySelector(".note-delete").addEventListener("click", () => deleteNote(n.id));
    item.querySelector(".note-mastered").addEventListener("click", () => toggleMastered(n));
    listEl.appendChild(item);
  }
}

async function deleteNote(id) {
  if (!confirm("이 문제를 삭제할까요?")) return;
  await fetch(`/api/review/${id}`, { method: "DELETE" });
  await loadAll();
}

async function toggleMastered(n) {
  await fetch(`/api/review/${n.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mastered: !n.mastered }),
  });
  await loadAll();
}

[listSubjectFilterEl, listImportantOnlyEl, listUnmasteredOnlyEl].forEach((el) =>
  el.addEventListener("change", renderList)
);

// ---------- quiz ----------
let allNotes = [];
let quizQueue = [];
let quizIndex = 0;
let quizCorrect = 0;
let quizWrongIds = [];
let quizAnswered = false;
let quizHistory = [];

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

let lastScope = [];

function startQuiz(notes) {
  lastScope = notes;
  quizQueue = shuffle(notes);
  quizIndex = 0;
  quizCorrect = 0;
  quizWrongIds = [];
  quizHistory = [];
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
  document.getElementById("quizSource").textContent = [n.subject, examLabelOf(n)].filter(Boolean).join(" · ");
  document.getElementById("quizQuestion").textContent = n.question;

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
    btn.addEventListener("click", () => selectChoice(n, idx + 1, btn));
    choicesEl.appendChild(btn);
  });
}

async function selectChoice(note, choiceNum, btn) {
  if (quizAnswered) return;
  quizAnswered = true;

  const correct = choiceNum === note.correctAnswer;
  const choicesEl = document.getElementById("quizChoices");
  [...choicesEl.children].forEach((el, i) => {
    el.classList.add("disabled");
    if (i + 1 === note.correctAnswer) el.classList.add("correct");
  });
  if (!correct) btn.classList.add("wrong");

  if (correct) quizCorrect += 1;
  else quizWrongIds.push(note.id);

  quizHistory.push({
    question: note.question,
    chosen: note.choices[choiceNum - 1],
    correctText: note.choices[note.correctAnswer - 1],
    correct,
  });

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

function renderQuizHistory() {
  const el = document.getElementById("quizHistory");
  el.innerHTML = quizHistory
    .map(
      (h, i) => `
      <div class="history-row-item ${h.correct ? "correct" : "wrong"}">
        <span>${i + 1}. ${escapeHtml(h.question).slice(0, 40)}${h.question.length > 40 ? "…" : ""}</span>
        <span>${h.correct ? "✓" : `✗ (정답: ${escapeHtml(h.correctText)})`}</span>
      </div>`
    )
    .join("");
}

document.getElementById("quizNextBtn").addEventListener("click", () => {
  quizIndex += 1;
  if (quizIndex >= quizQueue.length) {
    quizArea.hidden = true;
    quizDone.hidden = false;
    document.getElementById("quizResult").textContent = `${quizQueue.length}문제 중 ${quizCorrect}개 정답! (${Math.round((quizCorrect / quizQueue.length) * 100)}%)`;
    const retryWrongBtn = document.getElementById("quizRetryWrong");
    retryWrongBtn.hidden = quizWrongIds.length === 0;
    renderQuizHistory();
  } else {
    renderQuizQuestion();
  }
});

document.getElementById("quizRetryAll").addEventListener("click", () => startQuiz(lastScope));
document.getElementById("quizRetryWrong").addEventListener("click", () => {
  const wrongNotes = allNotes.filter((n) => quizWrongIds.includes(n.id));
  startQuiz(wrongNotes);
});

document.getElementById("startAllBtn").addEventListener("click", () => startQuiz(allNotes));
document.getElementById("startImportantBtn").addEventListener("click", () => startQuiz(allNotes.filter((n) => n.important)));
document.getElementById("startSubjectBtn").addEventListener("click", () => {
  const subject = document.getElementById("subjectFilter").value;
  if (!subject) return;
  startQuiz(allNotes.filter((n) => n.subject === subject));
});

// ---------- stats ----------
function renderStats() {
  document.getElementById("statTotal").textContent = allNotes.length;
  document.getElementById("statImportant").textContent = allNotes.filter((n) => n.important).length;
  document.getElementById("statUnmastered").textContent = allNotes.filter((n) => !n.mastered).length;
}

// ---------- load everything ----------
async function loadAll() {
  const res = await fetch("/api/review");
  allNotes = await res.json();
  renderStats();
  renderList();
}

async function init() {
  await loadSubjects();
  await loadAll();
}

init();
