/**
 * LifeApp.CompanionMessages — copy/mood data for the goal-behavior intervention UI.
 *
 * Separate from the existing public/companion.js (which drives the main goal
 * card's rule-based coach message and is left untouched). This file is only
 * the intervention modal's companion lines, namespaced under LifeApp so new
 * files stop adding bare globals.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.LifeApp = root.LifeApp || {};
    root.LifeApp.CompanionMessages = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function forStatus(status, goal) {
    const title = (goal && goal.title) || "목표";
    switch (status) {
      case "notified":
        return { emoji: "⏰", message: `"${title}" 시작할 시간이에요!` };
      case "snoozed":
        return { emoji: "😌", message: "알겠어요, 조금 있다가 다시 물어볼게요." };
      case "started":
        return { emoji: "🔥", message: "좋아요, 화이팅! 다 하면 완료를 눌러주세요." };
      case "completed":
        return { emoji: "🎉", message: "오늘도 해냈어요! 정말 잘했어요." };
      case "skipped":
        return { emoji: "😮‍💨", message: "오늘은 쉬어가요. 내일 다시 해봐요." };
      case "missed":
        return { emoji: "😅", message: "이번엔 놓쳤네요. 다음 기회에!" };
      default:
        return { emoji: "🐥", message: "오늘도 화이팅이에요!" };
    }
  }

  return { forStatus };
});
