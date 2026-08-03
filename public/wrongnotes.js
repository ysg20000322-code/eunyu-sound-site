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

// ---------- photo -> AI extraction ----------
const photoFile = document.getElementById("photoFile");
const photoPreview = document.getElementById("photoPreview");
const extractBtn = document.getElementById("extractBtn");
const extractStatus = document.getElementById("extractStatus");

photoFile.addEventListener("change", () => {
  const file = photoFile.files[0];
  extractBtn.disabled = !file;
  extractStatus.textContent = "";
  if (!file) {
    photoPreview.hidden = true;
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    photoPreview.src = reader.result;
    photoPreview.hidden = false;
  };
  reader.readAsDataURL(file);
});

function compressImage(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        const scale = maxDim / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function populateFormFromExtracted(data) {
  document.getElementById("fSource").value = data.source || "";
  document.getElementById("fQuestion").value = data.question || "";
  document.getElementById("fContext").value = data.context || "";
  document.getElementById("fExplanation").value = data.explanation || "";

  choiceRowsEl.innerHTML = "";
  const choices = Array.isArray(data.choices) && data.choices.length ? data.choices : ["", "", "", ""];
  const answerIndex = Number.isInteger(data.answerIndex) ? data.answerIndex : -1;
  choices.forEach((c, i) => addChoiceRow(c, i === answerIndex));
}

extractBtn.addEventListener("click", async () => {
  const file = photoFile.files[0];
  if (!file) return;
  extractBtn.disabled = true;
  extractStatus.textContent = "AI가 이미지를 읽는 중...";
  try {
    const dataUrl = await compressImage(file);
    const base64 = dataUrl.split(",")[1];
    const res = await fetch("/api/wrongnotes/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: base64, mediaType: "image/jpeg" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "인식 실패");
    populateFormFromExtracted(data);
    extractStatus.textContent = "인식 완료! 아래에서 내용을 확인하고 추가하세요.";
  } catch (err) {
    extractStatus.textContent = err.message || "인식에 실패했어요. 직접 입력해주세요.";
  } finally {
    extractBtn.disabled = false;
  }
});

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

  const res = await fetch("/api/wrongnotes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
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

  document.getElementById("fSource").value = "";
  document.getElementById("fQuestion").value = "";
  document.getElementById("fContext").value = "";
  document.getElementById("fExplanation").value = "";
  choiceRowsEl.innerHTML = "";
  for (let i = 0; i < 4; i++) addChoiceRow();

  addStatus.textContent = "추가됨 ✓";
  setTimeout(() => (addStatus.textContent = ""), 2000);

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
      ${n.source ? `<div class="activity-item-role">${escapeHtml(n.source)}</div>` : ""}
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
  await fetch(`/api/wrongnotes/${id}`, { method: "DELETE" });
  await loadAll();
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
  document.getElementById("quizSource").textContent = n.source || "";
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

  fetch(`/api/wrongnotes/${note.id}/attempt`, {
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

document.getElementById("quizRetryAll").addEventListener("click", () => startQuiz(allNotes));
document.getElementById("quizRetryWrong").addEventListener("click", () => {
  const wrongNotes = allNotes.filter((n) => quizWrongIds.includes(n.id));
  startQuiz(wrongNotes);
});

// ---------- load everything ----------
async function loadAll() {
  const res = await fetch("/api/wrongnotes");
  allNotes = await res.json();
  await loadList(allNotes);
  startQuiz(allNotes);
}

loadAll();
