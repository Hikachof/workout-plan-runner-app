// 重さの刻み。ダンベル 1 個の刻み（例：4kg から 1.5kg ずつ）を基準にして、
// 持ち方ごとに「何個ぶんの重さを記録するか」で刻みを掛け算する。
//   片手に 1 個ずつ（片手の重さで記録）・1 個を両手で … 1 個ぶん
//   2 個の合計で記録 … 2 個ぶん（8kg から 3kg ずつ）

export const DEFAULT_DUMBBELL = Object.freeze({ start: 4, step: 1.5, max: 60 });

const HOLDS = {
  per_dumbbell: { count: 1, label: "片手に 1 個ずつ", unitLabel: "片手の重さ", icon: "two" },
  single_dumbbell: { count: 1, label: "1 個", unitLabel: "1 個の重さ", icon: "one" },
  left_right_total: { count: 2, label: "2 個の合計", unitLabel: "2 個の合計", icon: "two" },
  both_hands_total: { count: 2, label: "2 個の合計", unitLabel: "2 個の合計", icon: "two" },
  bodyweight_plus: { count: 1, label: "自重＋おもり", unitLabel: "おもりの重さ", icon: "one" },
  bodyweight: { count: 0, label: "自重", unitLabel: "自重", icon: "body" },
  none: { count: 0, label: "重さなし", unitLabel: "", icon: "body" },
};

export function holdInfo(weightType) {
  return HOLDS[weightType] || { count: 1, label: weightType || "重さ", unitLabel: "重さ", icon: "one" };
}

export function hasWeight(weightType) {
  return holdInfo(weightType).count > 0;
}

export function normalizeDumbbell(value) {
  const start = positive(value?.start, DEFAULT_DUMBBELL.start);
  const step = positive(value?.step, DEFAULT_DUMBBELL.step);
  let max = positive(value?.max, DEFAULT_DUMBBELL.max);
  if (max < start) max = start;
  return { start, step, max };
}

// その持ち方で選べる重さの並び（最初・刻み・最後）
export function weightGrid(weightType, dumbbell) {
  const { count } = holdInfo(weightType);
  if (!count) return null;
  const d = normalizeDumbbell(dumbbell);
  const base = round2(d.start * count);
  const step = round2(d.step * count);
  const steps = Math.floor((d.max - d.start) / d.step + 1e-9);
  return { base, step, max: round2(base + steps * step) };
}

// いちばん近い刻みに合わせる（ちょうど真ん中なら軽い方）
export function snapWeight(value, weightType, dumbbell) {
  const grid = weightGrid(weightType, dumbbell);
  const number = Number(value);
  if (!grid) return null;
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return grid.base;
  const raw = (number - grid.base) / grid.step;
  const n = Math.ceil(raw - 0.5 - 1e-9);
  const maxN = Math.round((grid.max - grid.base) / grid.step);
  return round2(grid.base + clamp(n, 0, maxN) * grid.step);
}

// ＋／− で 1 刻み動かす
export function stepWeight(value, direction, weightType, dumbbell) {
  const grid = weightGrid(weightType, dumbbell);
  if (!grid) return null;
  const current = snapWeight(value, weightType, dumbbell);
  return snapWeight(current + Math.sign(direction) * grid.step, weightType, dumbbell);
}

// 2 個の合計なら片手ぶん（表示用）。それ以外は null
export function perHandWeight(value, weightType) {
  if (holdInfo(weightType).count !== 2) return null;
  const number = Number(value);
  return Number.isFinite(number) ? round2(number / 2) : null;
}

export function formatKg(value) {
  const number = Number(value);
  if (value === null || value === undefined || !Number.isFinite(number)) return "";
  return String(round2(number));
}

export function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? round2(number) : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
