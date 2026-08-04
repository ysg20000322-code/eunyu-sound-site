const express = require("express");
const { checkPassword, setSessionCookie, clearSessionCookie } = require("../lib/auth");

const router = express.Router();

router.post("/login", (req, res) => {
  if (!checkPassword((req.body || {}).password)) {
    return res.status(401).json({ error: "비밀번호가 올바르지 않아요" });
  }
  setSessionCookie(res);
  res.json({ ok: true });
});

router.post("/logout", (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

module.exports = router;
