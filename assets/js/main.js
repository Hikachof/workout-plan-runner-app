// 入口：状態を読み、画面を描き、ボタンの操作を actions.js に渡す

import { loadState, saveState } from "./store.js";
import { createTimer } from "./timer.js";
import { todayString, formatClock, escapeHtml } from "./format.js";
import { isNewPlan, validatePlan } from "./plan.js";
import { mergeHistory } from "./history.js";
import { fetchPublishedHistory } from "./sync.js";
import { $, $$, toast } from "./ui.js";
import { renderToday } from "./views/today.js";
import { renderRun } from "./views/run.js";
import { renderPlan } from "./views/plan.js";
import { renderLog } from "./views/log.js";
import { renderSettings } from "./views/settings.js";
import { handleAction, handleInput } from "./actions.js";

const state = loadState();
let saveTimer = null;

const app = {
  state,
  ui: {
    tab: "today",
    openExercises: new Set(),
    clearingExercise: null,
    clearingDaily: new Set(),
    showDoneDaily: false,
    logKey: null,
  },
  today: () => todayString(),
  save() {
    clearTimeout(saveTimer);
    saveState(state);
  },
  saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveState(state), 250);
  },
  render,
  go(tab) {
    app.ui.tab = tab;
    render();
    window.scrollTo({ top: 0 });
  },
  refreshPlan,
  timer: null,
  updateWakeLock,
};

// タイマーが出た・消えたときは画面ごと描き直す（「タイマー」の欄を出し入れするため）
let timerWasVisible = false;
app.timer = createTimer({
  state,
  save: () => app.save(),
  onChange: () => {
    const visible = app.timer?.isVisible() ?? false;
    if (visible !== timerWasVisible) {
      timerWasVisible = visible;
      render();
    } else {
      renderTimerDock();
    }
  },
});

const VIEWS = {
  today: () => (state.activeSession ? renderRun(app) : renderToday(app)),
  log: () => renderLog(app),
  plan: () => renderPlan(app),
  settings: () => renderSettings(app),
};

function render() {
  const view = $("#view");
  // 文字を入れている途中の欄は、描き直しで消さない
  const focused = document.activeElement;
  const focusKey = focused?.dataset?.input ? `${focused.dataset.input}|${focused.dataset.ei}|${focused.dataset.si}|${focused.dataset.key}` : null;
  view.innerHTML = (VIEWS[app.ui.tab] || VIEWS.today)();
  view.dataset.tab = app.ui.tab;
  $$(".nav-btn").forEach((b) => {
    const on = b.dataset.tab === app.ui.tab;
    b.classList.toggle("on", on);
    b.setAttribute("aria-current", on ? "page" : "false");
  });
  $(".nav-btn[data-tab=today] .nav-dot").hidden = !state.activeSession;
  if (focusKey) {
    const again = $$("[data-input]", view).find((el) => `${el.dataset.input}|${el.dataset.ei}|${el.dataset.si}|${el.dataset.key}` === focusKey);
    if (again && again.type !== "checkbox") again.focus();
  }
  renderTimerDock();
}

function renderTimerDock() {
  const dock = $("#timer-dock");
  const t = app.timer;
  if (!t || !t.isVisible()) {
    dock.hidden = true;
    document.body.classList.remove("has-dock");
    return;
  }
  const remaining = t.remaining();
  const total = Math.max(state.timer.total || remaining, 1);
  const ratio = t.isAlarming() ? 0 : Math.min(1, remaining / total);
  const circumference = 2 * Math.PI * 22;
  dock.hidden = false;
  document.body.classList.add("has-dock");
  dock.classList.toggle("alarm", t.isAlarming());
  dock.classList.toggle("paused", t.isPaused());
  const manual = state.timer.kind === "manual";
  const label = t.isAlarming() ? (manual ? "時間です！" : "休憩おわり！") : t.isPaused() ? "一時停止中" : manual ? "タイマー" : "休憩中";
  const html = `
    <div class="dock-ring" aria-hidden="true">
      <svg viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22"/><circle class="fg" cx="26" cy="26" r="22" stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${(circumference * (1 - ratio)).toFixed(1)}"/></svg>
    </div>
    <button class="dock-main" data-action="timer-toggle" type="button" aria-label="${t.isAlarming() ? "音を止める" : "一時停止・再開"}">
      <span class="dock-time">${t.isAlarming() ? "0:00" : formatClock(remaining)}</span>
      <span class="dock-label">${escapeHtml(label)}${state.timer.label && !t.isAlarming() ? ` — ${escapeHtml(state.timer.label)}` : ""}</span>
    </button>
    ${t.isAlarming() ? `<button class="dock-btn strong" data-action="timer-dismiss" type="button">止める</button>` : `
      <button class="dock-btn" data-action="timer-add" type="button">＋30秒</button>
      <button class="dock-btn" data-action="timer-dismiss" type="button">終わり</button>`}
  `;
  if (dock.dataset.html !== html) {
    dock.innerHTML = html;
    dock.dataset.html = html;
  }
}

async function refreshPlan({ silent } = { silent: false }) {
  try {
    const response = await fetch(`./plans/current.json?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const plan = await response.json();
    validatePlan(plan);
    state.lastSyncAt = new Date().toISOString();
    if (isNewPlan(plan, state.plan)) {
      state.plan = plan;
      if (!silent) toast("新しい計画を読み込みました。");
    } else if (!silent) {
      toast("計画は最新です。");
    }
    app.save();
    render();
  } catch (error) {
    if (!silent) toast(`計画を読めませんでした（${error.message}）`);
  }
}

// 公開ページの記録も合わせて読む（端末を入れ替えても、前回の記録や伸びが見えるように）
async function mergePublishedHistory() {
  try {
    const remote = await fetchPublishedHistory();
    if (!remote) return;
    const before = state.history.sessions.length;
    state.history = mergeHistory(state.history, remote);
    if (state.history.sessions.length !== before) {
      app.save();
      render();
    }
  } catch {
    // 読めなくても困らない
  }
}

// トレーニング中は画面を消さない（iPhone の Web アプリは、画面が消えると音を鳴らせないため）
let wakeLock = null;
async function updateWakeLock() {
  const want = Boolean(state.activeSession && state.settings.keepAwake && document.visibilityState === "visible");
  try {
    if (want && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    } else if (!want && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {
    wakeLock = null;
  }
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("./service-worker.js").then((registration) => {
    registration.update().catch(() => {});
    if (registration.waiting && navigator.serviceWorker.controller) registration.waiting.postMessage({ type: "SKIP_WAITING" });
    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) worker.postMessage({ type: "SKIP_WAITING" });
      });
    });
  }).catch(() => {});
}

function bindEvents() {
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || button.disabled) return;
    app.timer.prime();
    handleAction(app, button.dataset.action, button, event);
  });
  document.addEventListener("change", (event) => {
    if (event.target.dataset?.input) handleInput(app, event.target, "change");
  });
  document.addEventListener("input", (event) => {
    if (event.target.dataset?.input) handleInput(app, event.target, "input");
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      app.save();
    } else {
      app.timer.resume();
      if (app.ui.tab === "today") render();
    }
    updateWakeLock();
  });
  window.addEventListener("pagehide", () => app.save());
}

function init() {
  bindEvents();
  render();
  app.timer.resume();
  updateWakeLock();
  registerServiceWorker();
  refreshPlan({ silent: true });
  mergePublishedHistory();
}

init();
