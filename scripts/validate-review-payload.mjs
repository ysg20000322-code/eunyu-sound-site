#!/usr/bin/env node
// Validates a review-import payload file against the same rules
// POST /api/review/import enforces, so malformed data fails fast in CI
// before any network call is made. Used by the review-import.yml
// push-triggered workflow ahead of scripts/import-review-problem.mjs.
//
// Usage: node scripts/validate-review-payload.mjs <path-to-json>

import { readFileSync } from "node:fs";

const ALLOWED_SUBJECTS = ["조경사", "조경계획", "조경설계", "조경식재", "조경시공구조학", "조경관리론"];
const MAX_LEN = { question: 4000, choice: 1000, explanation: 4000, examLabel: 200, source: 300 };
const MAX_REQUEST_ID_LEN = 100;

function fail(errors) {
  console.error(JSON.stringify({ valid: false, errors }, null, 2));
  process.exit(1);
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) fail(["usage: validate-review-payload.mjs <path-to-json>"]);

  let raw;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err) {
    fail([`cannot read file: ${err.message}`]);
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    fail([`invalid JSON: ${err.message}`]);
  }

  const errors = [];

  const subject = String(data.subject || "").trim();
  if (!subject) errors.push("subject is required");
  else if (!ALLOWED_SUBJECTS.includes(subject)) {
    errors.push(`subject must be one of: ${ALLOWED_SUBJECTS.join(", ")}`);
  }

  const question = String(data.question || "").trim();
  if (!question) errors.push("question is required");
  else if (question.length > MAX_LEN.question) errors.push("question is too long");

  const choices = Array.isArray(data.choices) ? data.choices : [];
  if (choices.length !== 4) {
    errors.push("choices must be an array of exactly 4 items");
  } else {
    choices.forEach((c, i) => {
      const text = String(c ?? "").trim();
      if (!text) errors.push(`choice ${i + 1} is empty`);
      else if (text.length > MAX_LEN.choice) errors.push(`choice ${i + 1} is too long`);
    });
  }

  const correctAnswer = Number(data.correctAnswer);
  if (!Number.isInteger(correctAnswer) || correctAnswer < 1 || correctAnswer > 4) {
    errors.push("correctAnswer must be an integer from 1 to 4");
  }

  if (data.submittedAnswer !== null && data.submittedAnswer !== undefined && data.submittedAnswer !== "") {
    const sa = Number(data.submittedAnswer);
    if (!Number.isInteger(sa) || sa < 0 || sa > 4) errors.push("submittedAnswer must be null or an integer from 0 to 4");
  }

  if (data.examDate !== null && data.examDate !== undefined && data.examDate !== "") {
    const rawDate = String(data.examDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(Date.parse(rawDate))) {
      errors.push("examDate must be in YYYY-MM-DD format");
    }
  }

  if (data.questionNumber !== null && data.questionNumber !== undefined && data.questionNumber !== "") {
    const qn = Number(data.questionNumber);
    if (!Number.isInteger(qn) || qn < 1 || qn > 200) errors.push("questionNumber must be a positive integer");
  }

  if (data.examLabel && String(data.examLabel).length > MAX_LEN.examLabel) errors.push("examLabel is too long");
  if (data.explanation && String(data.explanation).length > MAX_LEN.explanation) errors.push("explanation is too long");
  if (data.source && String(data.source).length > MAX_LEN.source) errors.push("source is too long");

  // Required here (unlike the general API, where it's optional) because the
  // push-triggered pipeline relies on it for idempotent retries.
  const requestId = data.requestId === undefined || data.requestId === null ? "" : String(data.requestId).trim();
  if (!requestId) errors.push("requestId is required for review-imports/pending.json");
  else if (requestId.length > MAX_REQUEST_ID_LEN) errors.push(`requestId must be at most ${MAX_REQUEST_ID_LEN} characters`);

  if (errors.length > 0) fail(errors);

  console.log(JSON.stringify({ valid: true }));
}

main();
