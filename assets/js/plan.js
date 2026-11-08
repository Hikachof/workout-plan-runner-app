// 計画（plans/current.json）の読み方。画面に依らない。

import { timeValue } from "./format.js";

export function validatePlan(plan) {
  if (!plan || typeof plan !== "object") throw new Error("計画のファイルが読めません。");
  if (!plan.planId) throw new Error("計画に planId がありません。");
  if (!Array.isArray(plan.sessions) || !plan.sessions.length) throw new Error("計画に日がありません。");
}

export function isNewPlan(next, current) {
  if (!current) return true;
  if (next.planId !== current.planId) return true;
  return Number(next.version || 0) > Number(current.version || 0);
}

// "none" 計画なし / "before" まだ始まっていない / "active" 期間中 / "ended" 終わった
export function planStatus(plan, today) {
  if (!plan?.sessions?.length) return "none";
  const dates = plan.sessions.map((s) => s.scheduledDate).filter(Boolean).sort();
  const start = plan.startDate || dates[0];
  const end = plan.endDate || dates[dates.length - 1];
  if (start && today < start) return "before";
  if (end && today > end) return "ended";
  return "active";
}

export function planEndDate(plan) {
  if (!plan?.sessions?.length) return "";
  return plan.endDate || plan.sessions.map((s) => s.scheduledDate).sort().pop();
}

export function hasDailyTasks(plan, session) {
  return Boolean(session && session.dailyTasksEnabled !== false && (plan?.dailyTaskTemplate || []).length);
}

export function canStartSession(plan, session) {
  return Boolean(session && (!session.isRestDay || hasDailyTasks(plan, session)));
}

export function findSession(plan, sessionPlanId) {
  return plan?.sessions?.find((s) => s.sessionPlanId === sessionPlanId) || null;
}

export function findTodaySession(plan, today) {
  return plan?.sessions?.find((s) => s.scheduledDate === today) || null;
}

// 計画が切れた・今日の日が無いときの「次はこれ」：
// 最後にやった計画の日の次（最後まで行ったら最初に戻る）。記録が無ければ最初の日。
export function suggestNextSession(plan, history) {
  const sessions = (plan?.sessions || []).filter((s) => canStartSession(plan, s) && !s.isRestDay);
  if (!sessions.length) return null;
  const done = (history?.sessions || [])
    .filter((record) => record.planId === plan.planId)
    .sort((a, b) => timeValue(b.performedAt) - timeValue(a.performedAt));
  if (!done.length) return sessions[0];
  const lastIndex = sessions.findIndex((s) => s.sessionPlanId === done[0].sessionPlanId);
  if (lastIndex < 0) return sessions[0];
  // 同じ部位の並び（脚→胸→背中…）を回すため、次の「違う部位」の日を選ぶ
  const lastName = sessions[lastIndex].dayName;
  for (let offset = 1; offset <= sessions.length; offset += 1) {
    const candidate = sessions[(lastIndex + offset) % sessions.length];
    if (candidate.dayName !== lastName || offset === sessions.length) return candidate;
  }
  return sessions[(lastIndex + 1) % sessions.length];
}

// 計画の種目を、記録用の形に写す（前のアプリと同じ形）
export function createRunExercise(exercise) {
  const targets = exercise.setTargets?.length
    ? exercise.setTargets
    : Array.from({ length: Number(exercise.plannedSets) || 1 }, (_, index) => ({
      setNumber: index + 1,
      weight: exercise.plannedWeight,
      reps: exercise.plannedReps,
    }));
  return {
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    weightType: exercise.weightType,
    plannedWeight: exercise.plannedWeight,
    plannedReps: exercise.plannedReps,
    plannedSets: exercise.plannedSets,
    restSeconds: exercise.restSeconds || 90,
    status: "planned",
    formCues: exercise.formCues || [],
    sets: targets.map((target, index) => ({
      setNumber: target.setNumber ?? index + 1,
      plannedWeight: target.weight ?? null,
      actualWeight: target.weight ?? null,
      plannedReps: target.reps,
      actualReps: parseInt(target.reps, 10) || null,
      completed: false,
      rir: null,
      formRating: null,
      pain: "",
      memo: "",
    })),
    memo: exercise.memo || "",
  };
}
