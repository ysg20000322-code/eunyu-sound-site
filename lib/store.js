const fs = require("fs");
const path = require("path");
const { put, get } = require("@vercel/blob");

const DATA_DIR = path.join(__dirname, "..", "data");
const BLOB_PREFIX = "data/";
const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

function filePath(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function readJSONFile(name, fallback) {
  const p = filePath(name);
  if (!fs.existsSync(p)) return fallback;
  try {
    const raw = fs.readFileSync(p, "utf-8").trim();
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[store] failed to read ${name}.json:`, err.message);
    return fallback;
  }
}

function writeJSONFile(name, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath(name), JSON.stringify(data, null, 2), "utf-8");
}

async function readJSONBlob(name, fallback) {
  const pathname = `${BLOB_PREFIX}${name}.json`;
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result) return fallback;
    const text = await new Response(result.stream).text();
    return text.trim() ? JSON.parse(text) : fallback;
  } catch (err) {
    console.error(`[store] failed to read blob ${pathname}:`, err.message);
    return fallback;
  }
}

async function writeJSONBlob(name, data) {
  const pathname = `${BLOB_PREFIX}${name}.json`;
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}

async function readJSON(name, fallback) {
  return useBlob ? readJSONBlob(name, fallback) : readJSONFile(name, fallback);
}

async function writeJSON(name, data) {
  return useBlob ? writeJSONBlob(name, data) : writeJSONFile(name, data);
}

async function seedIfMissing(name, seedData) {
  const missing = Symbol("missing");
  const current = await readJSON(name, missing);
  if (current === missing) await writeJSON(name, seedData);
}

module.exports = { readJSON, writeJSON, seedIfMissing };
