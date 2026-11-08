// 端末の中に残す状態。前のアプリと同じ保存の鍵を使い、中身をそのまま引き継ぐ。

import { emptyHistory } from "./history.js";
import { normalizeDumbbell } from "./weights.js";

export const STORAGE_KEY = "workout-runner-state-v2";

export function normalizeState(value = {}, now = Date.now()) {
  return {
    plan: value.plan || null,
    history: value.history?.sessions ? value.history : emptyHistory(),
    lastSyncAt: value.lastSyncAt || null,
    timerSound: value.timerSound || "standard",
    timer: normalizeTimer(value, now),
    activeSession: value.activeSession || null,
    activeStartedAt: value.activeStartedAt || value.activeSession?.performedAt || null,
    githubSync: {
      token: value.githubSync?.token || "",
      auto: Boolean(value.githubSync?.auto),
      lastSyncedAt: value.githubSync?.lastSyncedAt || null,
      lastError: value.githubSync?.lastError || null,
    },
    settings: {
      dumbbell: normalizeDumbbell(value.settings?.dumbbell),
      keepAwake: value.settings?.keepAwake !== false,
    },
  };
}

// タイマーは「終わる時刻」で持つ（画面を消しても、戻ったときに正しい残りになる）。
// 前のアプリの「残り秒数＋数え始めた時刻」も読める。
function normalizeTimer(value, now) {
  const t = value.timer;
  if (t && typeof t === "object") {
    return {
      endAt: Number(t.endAt) || null,
      pausedRemaining: Math.max(0, Number(t.pausedRemaining) || 0),
      total: Math.max(0, Number(t.total) || 0),
      label: t.label || "",
      kind: t.kind === "manual" ? "manual" : "rest",
    };
  }
  const remaining = Math.max(0, Number(value.timerRemaining || 0));
  const startedAt = value.timerStartedAt ? new Date(value.timerStartedAt).getTime() : NaN;
  if (remaining > 0 && Number.isFinite(startedAt)) {
    return { endAt: startedAt + remaining * 1000, pausedRemaining: 0, total: remaining, label: "" };
  }
  return { endAt: null, pausedRemaining: remaining, total: remaining, label: "" };
}

export function loadState(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(STORAGE_KEY));
    if (saved) return normalizeState(saved);
  } catch {
    // 壊れていたら作り直す
  }
  return normalizeState({});
}

export function saveState(state, storage = globalThis.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
