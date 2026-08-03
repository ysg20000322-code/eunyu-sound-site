import type { CapacitorConfig } from "@capacitor/cli";

// Remote-URL shell (see docs/DECISIONS.md for the bundle-vs-remote comparison):
// the WebView loads the deployed site directly so the existing cookie-based
// auth (lib/auth.js) and every relative `fetch("/api/...")` call keep working
// completely unchanged. webDir still has to point somewhere for the CLI, but
// with `server.url` set it's never actually served — no separate build/copy
// step needed, it just points at the existing public/ folder.
//
// Override for local development, e.g. against the Android emulator talking
// to `npm start` on the host machine:
//   CAPACITOR_SERVER_URL=http://10.0.2.2:3000 npx cap sync android
const DEFAULT_SERVER_URL = "https://eunyu-sound-site-git-claude-app-development-ewc9z5-daybyday.vercel.app";

const config: CapacitorConfig = {
  appId: "com.eunyusound.lifeorganizer",
  appName: "내 인생 정리",
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL || DEFAULT_SERVER_URL,
    cleartext: false,
  },
  plugins: {
    LocalNotifications: {
      // No custom notification icon yet — Android falls back to the app's
      // launcher icon. To customize, generate a monochrome status-bar icon
      // via Android Studio's Image Asset tool (see docs/ANDROID_SETUP.md),
      // drop it in android/app/src/main/res/drawable/, then set smallIcon
      // here to that drawable's name (no extension).
      iconColor: "#4f46e5",
    },
  },
};

export default config;
