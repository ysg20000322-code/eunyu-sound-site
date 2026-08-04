const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DATA_DIR = path.join(__dirname, "..", "data");
const GOALS_FILE = path.join(DATA_DIR, "goals.json");
const EXECUTIONS_FILE = path.join(DATA_DIR, "goal-executions.json");

let goalsBackup = null;
let executionsBackup = null;
let server;
let baseUrl;
let cookie;

function snapshot(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : null;
}

function restore(file, content) {
  if (content === null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } else {
    fs.writeFileSync(file, content, "utf-8");
  }
}

async function api(pathname, { method = "GET", body } = {}) {
  const res = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  return { status: res.status, json };
}

test.before(async () => {
  goalsBackup = snapshot(GOALS_FILE);
  executionsBackup = snapshot(EXECUTIONS_FILE);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const app = require("../api/index.js");
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  const loginRes = await fetch(`${baseUrl}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: process.env.APP_PASSWORD || "eunyu2026" }),
  });
  cookie = loginRes.headers.get("set-cookie").split(";")[0];
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  restore(GOALS_FILE, goalsBackup);
  restore(EXECUTIONS_FILE, executionsBackup);
});

async function createGoalWithBehavior(time) {
  const { json: created } = await api("/api/goals", { method: "PUT", body: { title: "매일 운동" } });
  const { json: patched } = await api("/api/goals", {
    method: "PATCH",
    body: { behavior: { enabled: true, time, timezone: "Asia/Seoul", snoozeMinutes: 5, maxSnoozeCount: 3 } },
  });
  return patched;
}

test("GET /today is idempotent across repeated calls", async () => {
  const goal = await createGoalWithBehavior("19:00");
  const first = await api(`/api/goal-executions/today?goalId=${goal.id}`);
  const second = await api(`/api/goal-executions/today?goalId=${goal.id}`);
  assert.equal(first.json.ok, true);
  assert.equal(first.json.data.id, second.json.data.id);
  assert.equal(first.json.data.occurrenceKey, second.json.data.occurrenceKey);
});

test("concurrent GET /today calls do not create duplicate executions", async () => {
  const goal = await createGoalWithBehavior("20:00");
  await Promise.all(Array.from({ length: 5 }, () => api(`/api/goal-executions/today?goalId=${goal.id}`)));
  const { json: list } = await api(`/api/goal-executions?goalId=${goal.id}`);
  const matching = list.data.filter((e) => e.occurrenceKey.endsWith(":20:00"));
  assert.equal(matching.length, 1);
});

test("resubmitting the same transition is an idempotent no-op", async () => {
  const goal = await createGoalWithBehavior("21:00");
  const { json: today } = await api(`/api/goal-executions/today?goalId=${goal.id}`);
  const id = today.data.id;

  const first = await api(`/api/goal-executions/${id}/transition`, { method: "PATCH", body: { to: "started" } });
  assert.equal(first.status, 200);
  assert.equal(first.json.data.history.length, 2); // scheduled->started only

  const second = await api(`/api/goal-executions/${id}/transition`, { method: "PATCH", body: { to: "started" } });
  assert.equal(second.status, 200);
  assert.equal(second.json.data.history.length, 2); // unchanged, no duplicate entry
});

test("invalid transitions out of a terminal state are rejected with 409", async () => {
  const goal = await createGoalWithBehavior("22:00");
  const { json: today } = await api(`/api/goal-executions/today?goalId=${goal.id}`);
  const id = today.data.id;

  await api(`/api/goal-executions/${id}/transition`, { method: "PATCH", body: { to: "started" } });
  const completed = await api(`/api/goal-executions/${id}/transition`, { method: "PATCH", body: { to: "completed" } });
  assert.equal(completed.status, 200);

  const reopened = await api(`/api/goal-executions/${id}/transition`, { method: "PATCH", body: { to: "started" } });
  assert.equal(reopened.status, 409);
  assert.equal(reopened.json.ok, false);
  assert.equal(reopened.json.error.code, "INVALID_STATUS_TRANSITION");
});

test("changing goal behavior.time does not retroactively change existing executions", async () => {
  const goal = await createGoalWithBehavior("23:00");
  const { json: before } = await api(`/api/goal-executions/today?goalId=${goal.id}`);

  await api("/api/goals", { method: "PATCH", body: { behavior: { time: "23:30" } } });

  const { json: existingList } = await api(`/api/goal-executions?goalId=${goal.id}`);
  const unchanged = existingList.data.find((e) => e.id === before.data.id);
  assert.equal(unchanged.scheduledFor, before.data.scheduledFor);
  assert.equal(unchanged.occurrenceKey, before.data.occurrenceKey);

  const { json: after } = await api(`/api/goal-executions/today?goalId=${goal.id}`);
  assert.notEqual(after.data.occurrenceKey, before.data.occurrenceKey);
  assert.ok(after.data.occurrenceKey.endsWith(":23:30"));
});

test("goals.json without a behavior field is read with defaults and never rewritten", async () => {
  const legacyGoal = {
    id: "legacy-1",
    title: "옛날 목표",
    targetDate: null,
    note: "",
    milestones: [],
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  fs.writeFileSync(GOALS_FILE, JSON.stringify(legacyGoal, null, 2), "utf-8");

  const { json: response } = await api("/api/goals");
  assert.equal(response.behavior.enabled, false);
  assert.equal(response.behavior.timezone, "Asia/Seoul");

  const onDisk = JSON.parse(fs.readFileSync(GOALS_FILE, "utf-8"));
  assert.equal("behavior" in onDisk, false);
});
