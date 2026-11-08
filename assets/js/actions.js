// ボタンと入力欄の操作

import * as S from "./session.js";
import { findSession } from "./plan.js";
import { mergeHistory, sessionHighlights } from "./history.js";
import { pushHistory } from "./sync.js";
import { escapeHtml, formatDuration, nowString } from "./format.js";
import { formatKg, holdInfo, normalizeDumbbell } from "./weights.js";
import { closeSheet, downloadJson, icons, openSheet, toast } from "./ui.js";

const CLEAR_MS = 900;

export function handleAction(app, action, el) {
  const { state, ui } = app;
  const ei = Number(el.dataset.ei);
  const si = Number(el.dataset.si);
  const session = state.activeSession;

  switch (action) {
    case "go":
      return app.go(el.dataset.tab);
    case "refresh-plan":
      return app.refreshPlan({ silent: false });
    case "start":
      return start(app, el.dataset.id);

    case "set-toggle": {
      const result = S.toggleSet(session, ei, si);
      if (result) {
        const next = S.currentSetRef(session);
        const nextLabel = next ? `次は ${session.exercises[next.ei].name} ${next.si + 1} セット目` : "メインはぜんぶ終わり";
        app.timer.start(result.rest, nextLabel);
        if (result.exerciseDone) clearExercise(app, ei);
      }
      app.save();
      return app.render();
    }
    case "w-inc":
    case "w-dec":
      S.changeWeight(state, ei, si, action === "w-inc" ? 1 : -1);
      app.saveSoon();
      return app.render();
    case "r-inc":
    case "r-dec":
      S.changeReps(session, ei, si, action === "r-inc" ? 1 : -1);
      app.saveSoon();
      return app.render();
    case "add-set":
      S.addSet(session, ei);
      app.save();
      return app.render();
    case "skip":
      S.toggleSkip(session, ei);
      ui.openExercises.delete(ei);
      app.save();
      return app.render();
    case "open-ex":
      ui.openExercises.add(ei);
      return app.render();
    case "close-ex":
      ui.openExercises.delete(ei);
      return app.render();
    case "daily-toggle": {
      const index = Number(el.dataset.i);
      if (S.toggleDaily(session, index)) {
        ui.clearingDaily.add(index);
        setTimeout(() => { ui.clearingDaily.delete(index); app.render(); }, CLEAR_MS);
      }
      app.save();
      return app.render();
    }
    case "how-to": {
      const task = (state.plan?.dailyTaskTemplate || []).find((t) => t.taskId === el.dataset.task);
      if (!task) return undefined;
      return openSheet(`
        <div class="how-to">
          <h2 class="summary-title">${escapeHtml(task.name)}</h2>
          ${task.target ? `<p class="how-target">${escapeHtml(task.target)}</p>` : ""}
          ${secondsIn(task.target) ? `<button class="btn primary" data-action="timer-start" data-sec="${secondsIn(task.target)}" data-label="${escapeHtml(task.name)}" type="button">${secondsIn(task.target)}秒のタイマーを始める</button>` : ""}
          <ol>${String(task.memo || "").split("\n").filter(Boolean).map((line) => `<li>${escapeHtml(line.replace(/^\d+[.．、]\s*/, ""))}</li>`).join("")}</ol>
          <button class="btn primary big" data-action="sheet-close" type="button">閉じる</button>
        </div>`);
    }
    case "toggle-done-daily":
      ui.showDoneDaily = !ui.showDoneDaily;
      return app.render();
    case "finish":
      return finish(app);
    case "discard":
      if (!confirm("この回の記録を保存せずにやめますか？")) return;
      S.discardSession(state);
      app.timer.dismiss();
      app.save();
      app.updateWakeLock();
      return app.render();

    case "timer-start": {
      closeSheet();
      const seconds = Number(el.dataset.sec);
      if (!(seconds > 0)) return undefined;
      app.timer.start(seconds, el.dataset.label || "", "manual");
      return app.render();
    }
    case "timer-toggle":
      return app.timer.togglePause();
    case "timer-add":
      return app.timer.add(30);
    case "timer-dismiss":
      return app.timer.dismiss();

    case "sheet-close":
      return closeSheet();
    case "log-pick":
      ui.logKey = el.dataset.key;
      return app.render();

    case "test-sound":
      return app.timer.testSound();
    case "token-save":
      return saveToken(app);
    case "token-clear":
      if (!confirm("この iPhone に保存した GitHub の鍵を消しますか？")) return;
      Object.assign(state.githubSync, { token: "", auto: false, lastError: null, lastSyncedAt: null });
      app.save();
      toast("鍵を消しました。");
      return app.render();
    case "sync-now":
      return sync(app, { silent: false });
    case "export":
      return downloadJson("workout_history.json", { ...state.history, exportedAt: nowString() });
    default:
      return undefined;
  }
}

export async function handleInput(app, el, kind) {
  const { state } = app;
  const name = el.dataset.input;
  const ei = Number(el.dataset.ei);
  const si = Number(el.dataset.si);

  if (name === "notes" && state.activeSession) {
    state.activeSession.notes = el.value;
    return app.saveSoon();
  }
  if (kind !== "change") return undefined;

  switch (name) {
    case "w":
      S.typeWeight(state, ei, si, el.value.trim().replace(",", "."));
      app.save();
      return app.render();
    case "r":
      S.typeReps(state.activeSession, ei, si, el.value.trim());
      app.save();
      return app.render();
    case "dumbbell": {
      const next = { ...state.settings.dumbbell, [el.dataset.key]: Number(el.value.trim().replace(",", ".")) };
      state.settings.dumbbell = normalizeDumbbell(next);
      app.save();
      toast("ダンベルの刻みを変えました。");
      return app.render();
    }
    case "timer-sound":
      state.timerSound = el.value;
      app.timer.soundChanged();
      app.save();
      return app.timer.testSound();
    case "keep-awake":
      state.settings.keepAwake = el.checked;
      app.save();
      return app.updateWakeLock();
    case "auto-sync":
      state.githubSync.auto = el.checked;
      app.save();
      return app.render();
    case "token-file":
      return readTokenFile(app, el);
    default:
      return undefined;
  }
}

// 「100秒 × 1〜2セット」のような目標から秒数を取り出す（無ければ 0）
function secondsIn(text) {
  const match = String(text || "").match(/(\d+)\s*秒/);
  const seconds = match ? Number(match[1]) : 0;
  return seconds >= 20 ? seconds : 0; // 「2秒引き上げる」のような短い数はタイマーにしない
}

function start(app, sessionPlanId) {
  const { state, ui } = app;
  if (state.activeSession) {
    toast("トレーニング中です。先に「終えて保存」してください。");
    return app.go("today");
  }
  if (!findSession(state.plan, sessionPlanId)) return toast("その日が計画に見つかりません。");
  S.startSession(state, sessionPlanId);
  ui.openExercises.clear();
  ui.clearingDaily.clear();
  ui.clearingExercise = null;
  ui.showDoneDaily = false;
  app.save();
  app.updateWakeLock();
  app.go("today");
}

function clearExercise(app, ei) {
  app.ui.clearingExercise = ei;
  setTimeout(() => {
    if (app.ui.clearingExercise === ei) app.ui.clearingExercise = null;
    app.render();
  }, CLEAR_MS);
}

function finish(app) {
  const { state } = app;
  const session = state.activeSession;
  const progress = S.setProgress(session);
  if (progress.done < progress.total && !confirm(`まだ ${progress.total - progress.done} セット残っています。ここまでを保存して終わりますか？`)) return;
  const saved = S.finishSession(state);
  app.timer.dismiss();
  app.ui.openExercises.clear();
  app.save();
  app.updateWakeLock();
  app.render();
  openSheet(summaryHtml(state, saved));
  if (state.githubSync.auto && state.githubSync.token) sync(app, { silent: true });
}

function summaryHtml(state, saved) {
  const highlights = sessionHighlights(state.history, saved);
  const progress = S.setProgress(saved);
  const dailyDone = (saved.dailyTasks || []).filter((t) => t.completed).length;
  const praise = highlights.some((h) => h.kind === "pb") ? "自己ベスト更新！" : highlights.length ? "前回より重く！" : progress.done ? "おつかれさま！" : "記録しました";
  return `
    <div class="summary">
      <div class="summary-burst">${highlights.some((h) => h.kind === "pb") ? icons.trophy : icons.check}</div>
      <h2 class="summary-title">${praise}</h2>
      <div class="stats">
        <div class="stat"><b>${progress.done}<small>/${progress.total}</small></b><span>セット</span></div>
        <div class="stat"><b>${dailyDone}<small>/${(saved.dailyTasks || []).length}</small></b><span>日課</span></div>
        <div class="stat"><b>${escapeHtml(formatDuration(saved.durationSeconds) || "-")}</b><span>かかった時間</span></div>
      </div>
      ${highlights.map((h) => `
        <div class="highlight ${h.kind}">
          ${h.kind === "pb" ? icons.trophy : icons.arrowUp}
          <span><b>${escapeHtml(h.name)}</b><small>${h.kind === "pb" ? "これまででいちばん重い" : "前回より重い"} · ${escapeHtml(holdInfo(h.weightType).unitLabel)}</small></span>
          <em>${formatKg(h.weight)}kg<small>＋${formatKg(h.diff)}</small></em>
        </div>`).join("")}
      <button class="btn primary big" data-action="sheet-close" type="button">閉じる</button>
    </div>`;
}

function saveToken(app) {
  const input = document.querySelector('[data-input="token"]');
  const token = input?.value.trim();
  if (!token) return toast("鍵を入れてください。");
  app.state.githubSync.token = token;
  app.state.githubSync.lastError = null;
  app.save();
  toast("鍵をこの iPhone に保存しました。");
  return app.render();
}

async function readTokenFile(app, el) {
  const file = el.files?.[0];
  if (!file) return;
  try {
    const config = JSON.parse(await file.text());
    const token = String(config.token || config.githubToken || config.GITHUB_TOKEN || "").trim();
    if (!token) throw new Error("ファイルに token がありません");
    app.state.githubSync.token = token;
    app.state.githubSync.lastError = null;
    app.save();
    toast("ファイルから鍵を保存しました。");
    app.render();
  } catch (error) {
    toast(`鍵のファイルを読めませんでした（${error.message}）`);
  } finally {
    el.value = "";
  }
}

async function sync(app, { silent }) {
  const { state } = app;
  if (!state.githubSync.token) return toast("先に GitHub の鍵を保存してください。");
  try {
    const merged = await pushHistory(state.githubSync.token, state.history);
    state.history = mergeHistory(state.history, merged);
    state.githubSync.lastSyncedAt = nowString();
    state.githubSync.lastError = null;
    if (!silent) toast("記録を GitHub に送りました。");
  } catch (error) {
    state.githubSync.lastError = error.message;
    toast(`記録を送れませんでした（${error.message}）`);
  }
  app.save();
  app.render();
}
