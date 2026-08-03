const crypto = require("crypto");

const APP_PASSWORD = process.env.APP_PASSWORD || "eunyu2026";
const COOKIE_NAME = "session";

function computeToken() {
  return crypto.createHmac("sha256", APP_PASSWORD).update("life-organizer-session").digest("hex");
}

function parseCookies(header) {
  const cookies = {};
  if (!header) return cookies;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx === -1) return;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  });
  return cookies;
}

function timingSafeStringEqual(a, b) {
  const bufA = Buffer.from(String(a || ""));
  const bufB = Buffer.from(String(b || ""));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function checkPassword(input) {
  return timingSafeStringEqual(input, APP_PASSWORD);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req.headers.cookie);
  return timingSafeStringEqual(cookies[COOKIE_NAME], computeToken());
}

function setSessionCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${computeToken()}; HttpOnly; Path=/; Max-Age=2592000; SameSite=Lax${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

module.exports = { checkPassword, isAuthenticated, setSessionCookie, clearSessionCookie };
