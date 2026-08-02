const CACHE_NAME = "life-site-v1";
const STATIC_ASSETS = [
  "/", "/calendar.html", "/history.html", "/diary.html",
  "/style.css", "/app.js", "/calendar.js", "/history.js", "/diary.js", "/pwa.js",
  "/manifest.json", "/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(request).catch(() => new Response("[]", { headers: { "Content-Type": "application/json" } })));
    return;
  }

  // network-first so local edits during development are never masked by a stale cache;
  // cache is only used as an offline fallback.
  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        caches.open(CACHE_NAME).then((cache) => cache.put(request, networkRes.clone()));
        return networkRes;
      })
      .catch(() => caches.match(request))
  );
});
