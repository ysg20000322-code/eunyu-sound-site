function initMenu() {
  const btn = document.getElementById("menuBtn");
  const overlay = document.getElementById("menuOverlay");
  const closeBtn = document.getElementById("menuCloseBtn");
  if (!btn || !overlay) return;

  btn.addEventListener("click", () => (overlay.hidden = false));
  if (closeBtn) closeBtn.addEventListener("click", () => (overlay.hidden = true));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.hidden = true;
  });

  document.querySelectorAll("#sideMenu a[data-nav]").forEach((a) => {
    if (a.getAttribute("href") === location.pathname) a.classList.add("active");
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      location.href = "/login.html";
    });
  }

  const themeToggle = document.getElementById("themeToggle");
  if (themeToggle) {
    const current = localStorage.getItem("theme") || "dark";
    themeToggle.checked = current === "light";
    themeToggle.addEventListener("change", () => {
      const theme = themeToggle.checked ? "light" : "dark";
      localStorage.setItem("theme", theme);
      document.documentElement.setAttribute("data-theme", theme);
    });
  }
}

document.addEventListener("DOMContentLoaded", initMenu);
