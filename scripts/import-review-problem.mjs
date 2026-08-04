#!/usr/bin/env node
// Registers one 조경기사 오답 problem against the running site's
// POST /api/review/import endpoint. Reads the problem JSON from stdin.
//
// Usage:
//   node scripts/import-review-problem.mjs <<'JSON'
//   { "subject": "...", "question": "...", "choices": [...], "correctAnswer": 3, ... }
//   JSON
//
// Required env vars:
//   REVIEW_SITE_URL      e.g. https://내사이트.vercel.app
//   REVIEW_IMPORT_TOKEN  secret bearer token configured on the server

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function fail(payload) {
  console.error(JSON.stringify({ success: false, ...payload }, null, 2));
  process.exit(1);
}

async function main() {
  const siteUrl = process.env.REVIEW_SITE_URL;
  const token = process.env.REVIEW_IMPORT_TOKEN;

  if (!siteUrl) {
    fail({ error: "missing_env", message: "REVIEW_SITE_URL 환경변수가 설정되지 않았습니다." });
    return;
  }
  if (!token) {
    fail({ error: "missing_env", message: "REVIEW_IMPORT_TOKEN 환경변수가 설정되지 않았습니다." });
    return;
  }

  const raw = await readStdin();
  if (!raw.trim()) {
    fail({ error: "empty_input", message: "표준 입력으로 문제 JSON을 전달해주세요." });
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    fail({ error: "invalid_json", message: `JSON 파싱 실패: ${err.message}` });
    return;
  }

  let url;
  try {
    url = new URL("/api/review/import", siteUrl).toString();
  } catch (err) {
    fail({ error: "invalid_url", message: `REVIEW_SITE_URL이 올바른 URL이 아닙니다: ${err.message}` });
    return;
  }

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    fail({ error: "network_error", message: err.message });
    return;
  }

  let body;
  try {
    body = await res.json();
  } catch {
    body = { message: await res.text().catch(() => "") };
  }

  if (!res.ok) {
    fail({
      error: body.error || "request_failed",
      status: res.status,
      details: body.details || body.message || null,
    });
    return;
  }

  console.log(JSON.stringify(body, null, 2));
}

main();
