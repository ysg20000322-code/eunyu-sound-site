const ENCOURAGEMENTS = [
  "오늘도 한 걸음씩 가보아요!",
  "작은 진전도 진전이에요, 잘 하고 있어요 🌱",
  "쉬어가도 괜찮아요. 다시 시작하면 되니까요.",
  "오늘 하루도 응원할게요!",
];

function daysUntil(targetDate) {
  if (!targetDate) return null;
  const [y, m, d] = targetDate.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

function buildCompanionMessage(goal, checklistToday) {
  if (!goal) {
    return { emoji: "🐣", message: "아직 목표가 없어요! 큰 목표를 하나 정해볼까요?" };
  }

  if (goal.completedAt) {
    return { emoji: "🏆", message: `"${goal.title}" 목표를 완료하셨어요! 정말 대단해요!` };
  }

  const total = goal.milestones.length;
  const done = goal.milestones.filter((m) => m.done).length;

  if (total > 0 && done === total) {
    return { emoji: "🎉", message: "모든 단계를 완료했어요! 목표를 완료로 표시해보세요." };
  }

  const remain = daysUntil(goal.targetDate);
  if (remain !== null && remain <= 3 && remain >= 0 && total > 0 && done / total < 0.7) {
    return { emoji: "😟", message: `마감까지 ${remain}일 남았어요! 조금만 더 힘내봐요.` };
  }

  const checklist = checklistToday || [];
  if (checklist.length > 0) {
    const checklistDone = checklist.filter((i) => i.done).length;
    if (checklistDone === checklist.length) {
      return { emoji: "😄", message: "오늘 할 일을 다 끝냈네요! 최고예요 🎉" };
    }
    const left = checklist.length - checklistDone;
    return { emoji: "💪", message: `오늘 할 일이 ${left}개 남았어요. 하나씩 해봐요!` };
  }

  const pick = ENCOURAGEMENTS[new Date().getDate() % ENCOURAGEMENTS.length];
  return { emoji: "🐥", message: pick };
}
