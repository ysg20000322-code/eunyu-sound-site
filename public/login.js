const els = {
  input: document.getElementById("passwordInput"),
  btn: document.getElementById("loginBtn"),
  error: document.getElementById("loginError"),
};

async function submit() {
  const password = els.input.value;
  if (!password) return;
  els.error.hidden = true;

  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (res.ok) {
    location.href = "/";
    return;
  }
  els.error.textContent = "비밀번호가 올바르지 않아요.";
  els.error.hidden = false;
  els.input.value = "";
  els.input.focus();
}

els.btn.addEventListener("click", submit);
els.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") submit();
});
