// やった記録（workout_history.json）の読み方。画面に依らない。

import { localDateOf, nowString, timeValue } from "./format.js";
import { hasWeight, normalizeHold } from "./weights.js";

export function emptyHistory() {
  return { schemaVersion: "1.0", exportedAt: nowString(), sessions: [] };
}

// 2 つの記録を、sessionId で重ねずに合わせる（新しい順）。
// 同じ sessionId はローカル（a）を優先する。
export function mergeHistory(a, b) {
  const map = new Map();
  for (const session of b?.sessions || []) if (session?.sessionId) map.set(session.sessionId, session);
  for (const session of a?.sessions || []) if (session?.sessionId) map.set(session.sessionId, session);
  const sessions = Array.from(map.values()).sort((x, y) => timeValue(y.performedAt) - timeValue(x.performedAt));
  return { schemaVersion: a?.schemaVersion || b?.schemaVersion || "1.0", exportedAt: a?.exportedAt || nowString(), sessions };
}

export function exerciseKey(exercise) {
  return exercise?.exerciseId || exercise?.name || "";
}

export function isExerciseDone(exercise) {
  return exercise?.status === "completed" || (exercise?.sets?.length > 0 && exercise.sets.every((set) => set.completed));
}

function doneSets(exercise) {
  return (exercise?.sets || []).filter((set) => set.completed);
}

function setsForStats(exercise) {
  const done = doneSets(exercise);
  return done.length ? done : [];
}

// 1 回ぶんのまとめ：いちばん重い重さ、そのときの回数、各セット
function summarize(session, exercise) {
  // 前の「片手に 1 個ずつ」の記録は、2 個の合計に直して並べる（今の計画と比べられるように）
  const hold = (w) => normalizeHold(exercise.weightType, w);
  const sets = setsForStats(exercise).map((set) => ({ ...set, actualWeight: hold(set.actualWeight).weight, plannedWeight: hold(set.plannedWeight).weight }));
  if (!sets.length) return null;
  const weights = sets.map((set) => Number(set.actualWeight ?? set.plannedWeight)).filter(Number.isFinite);
  const best = weights.length ? Math.max(...weights) : null;
  return {
    sessionId: session.sessionId,
    date: localDateOf(session.performedAt),
    performedAt: session.performedAt,
    dayName: session.dayName,
    weightType: hold(null).weightType,
    best,
    sets: sets.map((set) => ({ weight: set.actualWeight ?? set.plannedWeight ?? null, reps: set.actualReps ?? null })),
    allDone: isExerciseDone(exercise),
  };
}

// 種目ごとの記録の並び（古い順）
export function exerciseSeries(history, key) {
  const out = [];
  for (const session of history?.sessions || []) {
    for (const exercise of session.exercises || []) {
      if (exerciseKey(exercise) !== key) continue;
      const item = summarize(session, exercise);
      if (item) out.push(item);
    }
  }
  return out.sort((a, b) => timeValue(a.performedAt) - timeValue(b.performedAt));
}

// 記録にある種目の一覧（最近やった順）
export function exerciseCatalog(history) {
  const seen = new Map();
  for (const session of history?.sessions || []) {
    for (const exercise of session.exercises || []) {
      const key = exerciseKey(exercise);
      if (!key || !setsForStats(exercise).length) continue;
      const t = timeValue(session.performedAt);
      const prev = seen.get(key);
      if (!prev || t > prev.lastTime) {
        seen.set(key, { key, name: exercise.name, weightType: normalizeHold(exercise.weightType).weightType, lastTime: t });
      }
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.lastTime - a.lastTime);
}

// 前回（今やっている回より前）の記録。持ち方を渡すと、同じ持ち方の記録だけから選ぶ
// （ダンベル 1 個でやっていた種目を 2 個に変えたとき、1 個の重さを「前回」に出さない）
export function lastPerformance(history, key, excludeSessionId, weightType) {
  const want = weightType ? normalizeHold(weightType).weightType : null;
  const series = exerciseSeries(history, key).filter((item) => item.sessionId !== excludeSessionId && (!want || item.weightType === want));
  return series.length ? series[series.length - 1] : null;
}

// これまでのいちばん重い重さ（同じ持ち方だけ）
export function previousBest(history, key, weightType, excludeSessionId) {
  let best = null;
  for (const item of exerciseSeries(history, key)) {
    if (item.sessionId === excludeSessionId || item.weightType !== weightType || item.best === null) continue;
    if (best === null || item.best > best) best = item.best;
  }
  return best;
}

// 保存した回のほめポイント：自己ベスト・前回より重い
export function sessionHighlights(history, session) {
  const out = [];
  for (const exercise of session.exercises || []) {
    if (!hasWeight(exercise.weightType)) continue;
    const item = summarize(session, exercise);
    if (!item || item.best === null) continue;
    const key = exerciseKey(exercise);
    const type = item.weightType;
    const best = previousBest(history, key, type, session.sessionId);
    const last = lastPerformance(history, key, session.sessionId, type);
    if (best !== null && item.best > best) {
      out.push({ kind: "pb", name: exercise.name, weight: item.best, diff: item.best - best, weightType: type });
    } else if (last?.best !== null && last?.best !== undefined && item.best > last.best) {
      out.push({ kind: "up", name: exercise.name, weight: item.best, diff: item.best - last.best, weightType: type });
    }
  }
  return out;
}

export function countSessionsInMonth(history, today) {
  const month = today.slice(0, 7);
  const days = new Set();
  for (const session of history?.sessions || []) {
    const date = localDateOf(session.performedAt);
    if (date.startsWith(month)) days.add(date);
  }
  return days.size;
}

export function latestRecordFor(history, sessionPlanId) {
  return (history?.sessions || [])
    .filter((s) => s.sessionPlanId === sessionPlanId)
    .sort((a, b) => timeValue(b.performedAt) - timeValue(a.performedAt))[0] || null;
}

export function recordsOnDate(history, date) {
  return (history?.sessions || []).filter((s) => localDateOf(s.performedAt) === date);
}
