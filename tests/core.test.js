import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { weightGrid, snapWeight, stepWeight, perHandWeight, normalizeDumbbell } from "../assets/js/weights.js";
import { normalizeState } from "../assets/js/store.js";
import { planStatus, suggestNextSession, createRunExercise, findTodaySession } from "../assets/js/plan.js";
import { mergeHistory, exerciseSeries, lastPerformance, sessionHighlights, exerciseCatalog } from "../assets/js/history.js";

const D = { start: 4, step: 1.5, max: 60 };
const plan = JSON.parse(readFileSync(new URL("./fixtures/plan-2026-09-22.json", import.meta.url), "utf8"));
const currentPlan = JSON.parse(readFileSync(new URL("../plans/current.json", import.meta.url), "utf8"));
const history = JSON.parse(readFileSync(new URL("../history/workout_history.json", import.meta.url), "utf8"));

test("片手・1 個の種目は 4kg から 1.5kg 刻み", () => {
  assert.deepEqual(weightGrid("per_dumbbell", D), { base: 4, step: 1.5, max: 59.5 });
  assert.equal(snapWeight(20.5, "per_dumbbell", D), 20.5);
  assert.equal(snapWeight(21, "single_dumbbell", D), 20.5);
  assert.equal(stepWeight(20.5, +1, "per_dumbbell", D), 22);
  assert.equal(stepWeight(4, -1, "per_dumbbell", D), 4);
});

test("2 個の合計の種目は 8kg から 3kg 刻み（片手の刻みの 2 倍）", () => {
  assert.deepEqual(weightGrid("both_hands_total", D), { base: 8, step: 3, max: 119 });
  assert.equal(snapWeight(62.5, "both_hands_total", D), 62);
  assert.equal(snapWeight(14.5, "left_right_total", D), 14);
  assert.equal(stepWeight(62, +1, "both_hands_total", D), 65);
  assert.equal(stepWeight(62, -1, "both_hands_total", D), 59);
  assert.equal(perHandWeight(62, "both_hands_total"), 31);
  assert.equal(perHandWeight(20.5, "per_dumbbell"), null);
});

test("自重は重さなし・上限で止まる・変な設定は既定に戻す", () => {
  assert.equal(weightGrid("bodyweight", D), null);
  assert.equal(snapWeight(999, "per_dumbbell", D), 59.5);
  assert.deepEqual(normalizeDumbbell({ start: -1, step: "x", max: 2 }), { start: 4, step: 1.5, max: 4 });
});

test("前のアプリの保存データ（残り秒数）をそのまま読める", () => {
  const legacy = { history: history, timerRemaining: 90, timerStartedAt: "2026-11-08T00:00:00.000Z", githubSync: { token: "x", auto: true } };
  const state = normalizeState(legacy);
  assert.equal(state.history.sessions.length, history.sessions.length);
  assert.equal(state.timer.endAt, Date.parse("2026-11-08T00:00:00.000Z") + 90000);
  assert.equal(state.githubSync.auto, true);
  assert.deepEqual(state.settings.dumbbell, D);
});

test("計画の期間：10/2 で終わった計画は ended", () => {
  assert.equal(planStatus(plan, "2026-11-08"), "ended");
  assert.equal(planStatus(plan, "2026-09-25"), "active");
  assert.equal(findTodaySession(plan, "2026-09-25").dayName, "脚");
});

test("計画が切れても、最後にやった日の次の部位を出す", () => {
  const h = { sessions: [{ sessionId: "s1", planId: plan.planId, sessionPlanId: plan.sessions[0].sessionPlanId, performedAt: "2026-09-22T10:00:00Z" }] };
  const next = suggestNextSession(plan, h);
  assert.notEqual(next.dayName, plan.sessions[0].dayName);
  assert.equal(suggestNextSession(plan, { sessions: [] }).sessionPlanId, plan.sessions[0].sessionPlanId);
});

test("計画の種目を記録の形にする", () => {
  const run = createRunExercise(plan.sessions[0].exercises[0]);
  assert.equal(run.sets.length, 2);
  assert.equal(run.sets[0].actualReps, 8);
  assert.equal(run.status, "planned");
});

test("記録を重ねずに合わせる（ローカル優先）", () => {
  const local = { sessions: [{ sessionId: "a", performedAt: "2026-11-01T00:00:00Z", notes: "local" }] };
  const remote = { sessions: [{ sessionId: "a", performedAt: "2026-11-01T00:00:00Z", notes: "remote" }, { sessionId: "b", performedAt: "2026-10-01T00:00:00Z" }] };
  const merged = mergeHistory(local, remote);
  assert.equal(merged.sessions.length, 2);
  assert.equal(merged.sessions[0].notes, "local");
});

test("種目ごとの伸びと前回、自己ベストの判定", () => {
  const catalog = exerciseCatalog(history);
  assert.ok(catalog.length > 3);
  const key = catalog.find((c) => c.name === "インクラインダンベルプレス").key;
  const series = exerciseSeries(history, key);
  assert.ok(series.length >= 2);
  assert.ok(lastPerformance(history, key, null).best >= 22);

  const newSession = {
    sessionId: "new", performedAt: "2026-11-08T03:00:00Z",
    exercises: [{ exerciseId: key, name: "インクラインダンベルプレス", weightType: "per_dumbbell", status: "completed", sets: [{ actualWeight: 25, actualReps: 8, completed: true }] }],
  };
  const h2 = mergeHistory({ sessions: [newSession] }, history);
  const highlights = sessionHighlights(h2, newSession);
  assert.equal(highlights[0].kind, "pb");
  assert.equal(highlights[0].weight, 25);
});

test("公開する計画：重さがすべて刻みに乗っていて、日付が続いている", () => {
  const dates = currentPlan.sessions.map((s) => s.scheduledDate);
  for (let i = 1; i < dates.length; i += 1) {
    assert.equal((Date.parse(dates[i]) - Date.parse(dates[i - 1])) / 86400000, 1);
  }
  assert.equal(dates[0], currentPlan.startDate);
  assert.equal(dates[dates.length - 1], currentPlan.endDate);
  for (const s of currentPlan.sessions) {
    for (const e of s.exercises) {
      for (const t of e.setTargets) assert.equal(snapWeight(t.weight, e.weightType, D), t.weight, `${s.scheduledDate} ${e.name} ${t.weight}`);
    }
  }
  assert.equal(currentPlan.dailyTaskTemplate.length, 7);
  assert.ok(currentPlan.dailyTaskTemplate.every((t) => t.memo));
});
