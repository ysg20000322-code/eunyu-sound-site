const express = require("express");
const crypto = require("crypto");
const { readJSON, writeJSON, withLock } = require("../lib/store");
const ALLOWED_SUBJECTS = require("../lib/reviewSubjects.json");

const router = express.Router();

const RESOURCE = "reviewproblems";

const MAX_LEN = {
  question: 4000,
  choice: 1000,
  explanation: 4000,
  examLabel: 200,
  source: 300,
};

// ---------- sanitization / normalization ----------

function stripControlChars(str) {
  return String(str ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
}

function sanitizeText(str) {
  return stripControlChars(str).trim();
}

// Builds a comparison key that ignores formatting differences (whitespace,
// HTML, question-number prefixes, parenthetical English glosses, case) so
// the same question re-typed slightly differently still dedupes correctly.
function normalizeQuestion(text) {
  let s = stripControlChars(text);
  s = s.replace(/<[^>]*>/g, " ");
  s = s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
  s = s.replace(/^\s*(?:q\.?\s*)?\d{1,3}\s*[.)\u3001\uFF0E:\uFF1A\uBC88]\s*/i, "");
  s = s.replace(/\([^)]*\)/g, " ").replace(/（[^）]*）/g, " ");
  s = s.replace(/[^\p{L}\p{N}\s]/gu, " ");
  s = s.toLowerCase().replace(/\s+/g, " ").trim();
  return s;
}

function computeFingerprint(normalized) {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// ---------- validation ----------

function validateProblemPayload(body) {
  const errors = [];
  body = body || {};

  const subject = sanitizeText(body.subject);
  if (!subject) errors.push("subject is required");
  else if (!ALLOWED_SUBJECTS.includes(subject)) {
    errors.push(`subject must be one of: ${ALLOWED_SUBJECTS.join(", ")}`);
  }

  const question = sanitizeText(body.question);
  if (!question) errors.push("question is required");
  else if (question.length > MAX_LEN.question) errors.push("question is too long");

  const choicesRaw = Array.isArray(body.choices) ? body.choices : [];
  if (choicesRaw.length !== 4) {
    errors.push("choices must be an array of exactly 4 items");
  }
  const choices = choicesRaw.map((c) => sanitizeText(c));
  if (choices.length === 4) {
    choices.forEach((c, i) => {
      if (!c) errors.push(`choice ${i + 1} is empty`);
      else if (c.length > MAX_LEN.choice) errors.push(`choice ${i + 1} is too long`);
    });
  }

  const correctAnswer = Number(body.correctAnswer);
  if (!Number.isInteger(correctAnswer) || correctAnswer < 1 || correctAnswer > 4) {
    errors.push("correctAnswer must be an integer from 1 to 4");
  }

  let submittedAnswer = null;
  if (body.submittedAnswer !== null && body.submittedAnswer !== undefined && body.submittedAnswer !== "") {
    const sa = Number(body.submittedAnswer);
    if (!Number.isInteger(sa) || sa < 0 || sa > 4) {
      errors.push("submittedAnswer must be null or an integer from 0 to 4");
    } else {
      submittedAnswer = sa === 0 ? null : sa;
    }
  }

  let examDate = null;
  if (body.examDate !== null && body.examDate !== undefined && body.examDate !== "") {
    const raw = String(body.examDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
      errors.push("examDate must be in YYYY-MM-DD format");
    } else {
      examDate = raw;
    }
  }

  let questionNumber = null;
  if (body.questionNumber !== null && body.questionNumber !== undefined && body.questionNumber !== "") {
    const qn = Number(body.questionNumber);
    if (!Number.isInteger(qn) || qn < 1 || qn > 200) {
      errors.push("questionNumber must be a positive integer");
    } else {
      questionNumber = qn;
    }
  }

  const examLabel = sanitizeText(body.examLabel);
  if (examLabel.length > MAX_LEN.examLabel) errors.push("examLabel is too long");

  const explanation = sanitizeText(body.explanation);
  if (explanation.length > MAX_LEN.explanation) errors.push("explanation is too long");

  const source = sanitizeText(body.source);
  if (source.length > MAX_LEN.source) errors.push("source is too long");

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    data: {
      subject,
      question,
      choices,
      correctAnswer,
      submittedAnswer,
      examDate,
      questionNumber,
      examLabel,
      explanation,
      source,
    },
  };
}

// ---------- request idempotency ----------

const MAX_REQUEST_ID_LEN = 100;

// Validates an optional client-supplied idempotency token. Returns
// { ok: true, requestId } (requestId may be null when omitted) or
// { ok: false, error }.
function readRequestId(payload) {
  const raw = payload && payload.requestId;
  if (raw === undefined || raw === null || raw === "") return { ok: true, requestId: null };
  const id = String(raw).trim();
  if (!id || id.length > MAX_REQUEST_ID_LEN) {
    return { ok: false, error: `requestId must be a non-empty string up to ${MAX_REQUEST_ID_LEN} characters` };
  }
  return { ok: true, requestId: id };
}

function findByRequestId(list, requestId) {
  if (!requestId) return null;
  for (const item of list) {
    if (item.requestLog && item.requestLog[requestId]) {
      return { item, logged: item.requestLog[requestId] };
    }
  }
  return null;
}

// ---------- shared create-or-bump logic ----------

async function createOrBumpProblem(payload) {
  const result = validateProblemPayload(payload);
  if (!result.valid) return { ok: false, errors: result.errors };

  const requestIdResult = readRequestId(payload);
  if (!requestIdResult.ok) return { ok: false, errors: [requestIdResult.error] };
  const requestId = requestIdResult.requestId;

  const data = result.data;
  const normalizedQuestion = normalizeQuestion(data.question);
  const sourceFingerprint = computeFingerprint(normalizedQuestion);
  const now = new Date().toISOString();

  const outcome = await withLock(RESOURCE, async () => {
    const list = await readJSON(RESOURCE, []);

    // Same requestId seen before: replay the recorded outcome verbatim
    // without touching externalWrongCount again. Protects against retried
    // Actions runs / network blips resubmitting the identical request.
    const prior = findByRequestId(list, requestId);
    if (prior) {
      return { action: prior.logged.action, item: prior.item, idempotentReplay: true };
    }

    let existing = null;
    if (data.examDate && data.questionNumber != null) {
      existing = list.find(
        (p) => p.subject === data.subject && p.examDate === data.examDate && p.questionNumber === data.questionNumber
      );
    }
    if (!existing) {
      existing = list.find((p) => p.subject === data.subject && p.sourceFingerprint === sourceFingerprint);
    }

    if (existing) {
      existing.externalWrongCount = (existing.externalWrongCount || 0) + 1;
      existing.lastExternalWrongAt = now;
      existing.updatedAt = now;
      existing.important = existing.externalWrongCount >= 2;
      if (requestId) {
        existing.requestLog = existing.requestLog || {};
        existing.requestLog[requestId] = { action: "duplicate", at: now };
      }
      await writeJSON(RESOURCE, list);
      return { action: "duplicate", item: existing };
    }

    const item = {
      id: `question_${crypto.randomUUID()}`,
      subject: data.subject,
      examDate: data.examDate,
      examLabel: data.examLabel,
      questionNumber: data.questionNumber,
      question: data.question,
      choices: data.choices,
      correctAnswer: data.correctAnswer,
      submittedAnswer: data.submittedAnswer,
      explanation: data.explanation,
      source: data.source,
      normalizedQuestion,
      sourceFingerprint,
      createdAt: now,
      updatedAt: now,
      externalWrongCount: 1,
      lastExternalWrongAt: now,
      reviewAttemptCount: 0,
      reviewCorrectCount: 0,
      reviewWrongCount: 0,
      correctStreak: 0,
      important: false,
      mastered: false,
      ...(requestId ? { requestLog: { [requestId]: { action: "created", at: now } } } : {}),
    };
    list.push(item);
    await writeJSON(RESOURCE, list);
    return { action: "created", item };
  });

  return { ok: true, ...outcome };
}

// ---------- import auth ----------

function timingSafeEqualStr(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireImportToken(req, res, next) {
  const configuredToken = process.env.REVIEW_IMPORT_TOKEN;
  if (!configuredToken) {
    return res.status(503).json({ success: false, error: "import endpoint is not configured" });
  }
  const header = req.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match ? match[1].trim() : "";
  if (!provided || !timingSafeEqualStr(provided, configuredToken)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  next();
}

// ---------- routes ----------

router.get("/", async (req, res) => {
  const list = await readJSON(RESOURCE, []);
  const { subject } = req.query;
  if (subject) return res.json(list.filter((p) => p.subject === subject));
  res.json(list);
});

router.get("/subjects", async (req, res) => {
  res.json(ALLOWED_SUBJECTS);
});

// Secondary/manual entry point used by the site's own "직접 추가" form.
router.post("/", async (req, res) => {
  const outcome = await createOrBumpProblem(req.body);
  if (!outcome.ok) return res.status(400).json({ error: outcome.errors.join("; ") });
  if (outcome.action === "created") return res.status(201).json(outcome.item);
  res.status(200).json({ ...outcome.item, duplicate: true });
});

// Primary entry point: Claude's registration script (scripts/import-review-problem.mjs).
router.post("/import", requireImportToken, async (req, res) => {
  const outcome = await createOrBumpProblem(req.body);
  if (!outcome.ok) {
    return res.status(400).json({ success: false, error: "validation_failed", details: outcome.errors });
  }

  if (outcome.action === "created") {
    return res.status(201).json({
      success: true,
      action: "created",
      questionId: outcome.item.id,
      idempotentReplay: Boolean(outcome.idempotentReplay),
      message: outcome.idempotentReplay
        ? "이미 처리된 요청입니다 (requestId 재사용, 변경 없음)."
        : "새로운 문제가 등록되었습니다.",
    });
  }

  return res.status(200).json({
    success: true,
    action: "duplicate",
    questionId: outcome.item.id,
    externalWrongCount: outcome.item.externalWrongCount,
    important: outcome.item.important,
    idempotentReplay: Boolean(outcome.idempotentReplay),
    message: outcome.idempotentReplay
      ? "이미 처리된 요청입니다 (requestId 재사용, 오답 횟수 변경 없음)."
      : `기존 문제의 오답 횟수를 ${outcome.item.externalWrongCount}회로 변경${
          outcome.item.important ? "하고 중요 문제로 표시했습니다." : "했습니다."
        }`,
  });
});

router.put("/:id", async (req, res) => {
  const result = validateProblemPayload(req.body);
  if (!result.valid) return res.status(400).json({ error: result.errors.join("; ") });

  const data = result.data;
  const normalizedQuestion = normalizeQuestion(data.question);
  const sourceFingerprint = computeFingerprint(normalizedQuestion);

  const outcome = await withLock(RESOURCE, async () => {
    const list = await readJSON(RESOURCE, []);
    const idx = list.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return null;
    const updated = {
      ...list[idx],
      ...data,
      normalizedQuestion,
      sourceFingerprint,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    await writeJSON(RESOURCE, list);
    return updated;
  });

  if (!outcome) return res.status(404).json({ error: "not found" });
  res.json(outcome);
});

router.patch("/:id", async (req, res) => {
  const outcome = await withLock(RESOURCE, async () => {
    const list = await readJSON(RESOURCE, []);
    const idx = list.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return null;
    const item = list[idx];
    if (typeof req.body.mastered === "boolean") item.mastered = req.body.mastered;
    if (typeof req.body.important === "boolean") item.important = req.body.important;
    item.updatedAt = new Date().toISOString();
    await writeJSON(RESOURCE, list);
    return item;
  });
  if (!outcome) return res.status(404).json({ error: "not found" });
  res.json(outcome);
});

router.post("/:id/attempt", async (req, res) => {
  const correct = Boolean(req.body.correct);
  const outcome = await withLock(RESOURCE, async () => {
    const list = await readJSON(RESOURCE, []);
    const idx = list.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return null;
    const item = list[idx];
    item.reviewAttemptCount = (item.reviewAttemptCount || 0) + 1;
    if (correct) {
      item.reviewCorrectCount = (item.reviewCorrectCount || 0) + 1;
      item.correctStreak = (item.correctStreak || 0) + 1;
    } else {
      item.reviewWrongCount = (item.reviewWrongCount || 0) + 1;
      item.correctStreak = 0;
    }
    item.updatedAt = new Date().toISOString();
    await writeJSON(RESOURCE, list);
    return item;
  });
  if (!outcome) return res.status(404).json({ error: "not found" });
  res.json(outcome);
});

router.delete("/:id", async (req, res) => {
  const outcome = await withLock(RESOURCE, async () => {
    const list = await readJSON(RESOURCE, []);
    const idx = list.findIndex((p) => p.id === req.params.id);
    if (idx === -1) return null;
    const [removed] = list.splice(idx, 1);
    await writeJSON(RESOURCE, list);
    return removed;
  });
  if (!outcome) return res.status(404).json({ error: "not found" });
  res.json(outcome);
});

module.exports = router;
