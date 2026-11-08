// トレーニング中の回の操作（画面に依らない）。記録の形は前のアプリと同じ。

import { compactNowString, nowString } from "./format.js";
import { createRunExercise, findSession, hasDailyTasks } from "./plan.js";
import { isExerciseDone } from "./history.js";
import { hasWeight, snapWeight, stepWeight } from "./weights.js";

// 日課の名前を、人に見られても気にならない言い方で出す（前のアプリと同じ置き換え）
const DISCREET_ID = "daily-core-relax-breath";
const LEGACY_ID = String.fromCharCode(100, 97, 105, 108, 121, 45, 112, 101, 108, 118, 105, 99, 45, 102, 108, 111, 111, 114);
const DISCREET_VIEW = {
  taskId: DISCREET_ID,
  name: "コアリラックス呼吸",
  target: "毎日 朝/夜: 仰向け 30%で2秒引き上げ→5秒脱力 × 3〜5回",
  memo: "呼吸を止めず、お尻・太もも・腹筋を固めず、下腹部の奥を軽く引き上げる感覚で行う。毎回完全に緩める。痛み、違和感、力みが残る感じがあれば中止または負荷を下げる。",
};

export function displayDailyTask(task) {
  const id = task?.taskId || task?.name || "";
  if (id !== DISCREET_ID && id !== LEGACY_ID) return task;
  return { ...task, ...DISCREET_VIEW, completed: task?.completed, sets: task?.sets, memo: task?.memo || DISCREET_VIEW.memo };
}

export function startSession(state, sessionPlanId, mode = "as_planned") {
  const plan = state.plan;
  const sessionPlan = findSession(plan, sessionPlanId);
  if (!sessionPlan) return null;
  const dumbbell = state.settings.dumbbell;
  const daily = hasDailyTasks(plan, sessionPlan) ? plan.dailyTaskTemplate || [] : [];
  const exercises = (sessionPlan.isRestDay ? [] : sessionPlan.exercises || []).map((exercise) => {
    const run = createRunExercise(exercise);
    // 計画の重さが刻みから外れていたら（例：合計 62.5kg）、いちばん近い刻みに合わせる
    if (hasWeight(run.weightType)) {
      run.sets.forEach((set) => { set.actualWeight = snapWeight(set.actualWeight, run.weightType, dumbbell); });
    }
    return run;
  });
  const now = new Date();
  state.activeSession = {
    sessionId: `session-${compactNowString(now)}`,
    planId: plan.planId,
    sessionPlanId: sessionPlan.sessionPlanId,
    performedAt: now.toISOString(),
    dayNumber: sessionPlan.dayNumber,
    dayName: sessionPlan.dayName,
    executionMode: mode,
    durationSeconds: 0,
    fatigue: null,
    dailyTasks: daily.map((task) => {
      const view = displayDailyTask(task);
      return { taskId: view.taskId, name: view.name, target: view.target || "", completed: false, sets: [], memo: "" };
    }),
    exercises,
    addedExercises: [],
    skippedExerciseIds: [],
    notes: "",
  };
  state.activeStartedAt = now.toISOString();
  return state.activeSession;
}

export function setProgress(session) {
  const sets = (session?.exercises || []).filter((e) => e.status !== "skipped").flatMap((e) => e.sets);
  return { done: sets.filter((s) => s.completed).length, total: sets.length };
}

// いま手をつけるセット（最初の、まだ終わっていないセット）
export function currentSetRef(session) {
  for (const [ei, exercise] of (session?.exercises || []).entries()) {
    if (exercise.status === "skipped" || exercise.status === "completed") continue;
    const si = exercise.sets.findIndex((s) => !s.completed);
    if (si >= 0) return { ei, si };
  }
  return null;
}

// セットの完了を切り替える。終わったら休憩の秒数を返す（タイマー用）
export function toggleSet(session, ei, si) {
  const exercise = session.exercises[ei];
  const set = exercise?.sets[si];
  if (!set) return null;
  set.completed = !set.completed;
  if (set.completed) {
    if (isExerciseDone(exercise)) exercise.status = "completed";
    return { rest: exercise.restSeconds || 90, exerciseDone: exercise.status === "completed" };
  }
  if (exercise.status === "completed") exercise.status = "planned";
  return null;
}

export function changeWeight(state, ei, si, direction) {
  const exercise = state.activeSession.exercises[ei];
  const set = exercise.sets[si];
  const next = stepWeight(set.actualWeight ?? set.plannedWeight, direction, exercise.weightType, state.settings.dumbbell);
  set.actualWeight = next;
  // まだやっていない後ろのセットも、同じ重さにそろえる（毎セット押し直さなくてよい）
  exercise.sets.slice(si + 1).forEach((later) => { if (!later.completed) later.actualWeight = next; });
}

export function typeWeight(state, ei, si, value) {
  const exercise = state.activeSession.exercises[ei];
  exercise.sets[si].actualWeight = value === "" ? null : snapWeight(value, exercise.weightType, state.settings.dumbbell);
}

export function changeReps(session, ei, si, direction) {
  const set = session.exercises[ei].sets[si];
  const current = Number.isFinite(set.actualReps) ? set.actualReps : parseInt(set.plannedReps, 10) || 0;
  set.actualReps = Math.max(0, current + Math.sign(direction));
}

export function typeReps(session, ei, si, value) {
  const n = parseInt(value, 10);
  session.exercises[ei].sets[si].actualReps = Number.isFinite(n) && n >= 0 ? n : null;
}

export function addSet(session, ei) {
  const exercise = session.exercises[ei];
  const previous = exercise.sets[exercise.sets.length - 1];
  exercise.sets.push({
    setNumber: exercise.sets.length + 1,
    plannedWeight: previous?.plannedWeight ?? exercise.plannedWeight ?? null,
    actualWeight: previous?.actualWeight ?? exercise.plannedWeight ?? null,
    plannedReps: previous?.plannedReps ?? exercise.plannedReps,
    actualReps: previous?.actualReps ?? null,
    completed: false, rir: null, formRating: null, pain: "", memo: "",
  });
  if (exercise.status === "completed") exercise.status = "planned";
}

export function toggleSkip(session, ei) {
  const exercise = session.exercises[ei];
  if (exercise.status === "skipped") {
    exercise.status = isExerciseDone(exercise) ? "completed" : "planned";
  } else {
    exercise.status = "skipped";
    exercise.sets.forEach((set) => { set.completed = false; });
  }
}

export function reopenExercise(session, ei) {
  const exercise = session.exercises[ei];
  if (exercise.status === "completed") exercise.status = "planned";
}

export function toggleDaily(session, index) {
  const task = session.dailyTasks[index];
  if (task) task.completed = !task.completed;
  return Boolean(task?.completed);
}

// 終えて保存：記録の先頭に入れる。保存した回を返す
export function finishSession(state) {
  const session = state.activeSession;
  if (!session) return null;
  const started = new Date(state.activeStartedAt || session.performedAt).getTime();
  session.durationSeconds = Number.isFinite(started) ? Math.max(0, Math.round((Date.now() - started) / 1000)) : 0;
  session.dailyTasks = (session.dailyTasks || []).map((task) => {
    const view = displayDailyTask(task);
    return { ...task, taskId: view.taskId, name: view.name, target: view.target || "" };
  });
  session.skippedExerciseIds = session.exercises.filter((e) => e.status === "skipped").map((e) => e.exerciseId);
  state.history.exportedAt = nowString();
  state.history.sessions.unshift(session);
  state.activeSession = null;
  state.activeStartedAt = null;
  return session;
}

export function discardSession(state) {
  state.activeSession = null;
  state.activeStartedAt = null;
}
