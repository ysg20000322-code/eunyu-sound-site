// Inside the Capacitor Android shell, local notifications are the native
// delivery path — registering the PWA service worker there too would mix two
// offline/caching strategies for no benefit.
const isNativeShell = Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

if (!isNativeShell && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => console.warn("SW 등록 실패:", err));
  });
}
