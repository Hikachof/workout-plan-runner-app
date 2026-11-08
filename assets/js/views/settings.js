// 「設定」の画面：ダンベルの刻み・タイマーの音・計画・記録の同期

import { escapeHtml, formatDateTime } from "../format.js";
import { formatKg, weightGrid } from "../weights.js";
import { TIMER_SOUNDS } from "../timer.js";
import { icons } from "../ui.js";

export const APP_VERSION = "2.0.0";

export function renderSettings(app) {
  const { state } = app;
  const d = state.settings.dumbbell;
  const one = weightGrid("per_dumbbell", d);
  const two = weightGrid("both_hands_total", d);
  const sync = state.githubSync;
  const syncStatus = sync.lastError
    ? `うまくいきませんでした：${sync.lastError}`
    : sync.lastSyncedAt ? `${formatDateTime(sync.lastSyncedAt)} に同期` : sync.token ? (sync.auto ? "保存のたびに自動で同期" : "手で同期") : "まだ設定していません";

  return `
    <header class="page-head"><p class="eyebrow">設定</p><h1 class="title">設定</h1></header>

    <section class="card">
      <h2 class="section-title">ダンベル</h2>
      <p class="muted small">ダンベル 1 個の重さの刻みです。2 個の合計で記録する種目は、この 2 倍の刻みになります。</p>
      <div class="field-grid">
        ${numberField("いちばん軽い", "start", d.start)}
        ${numberField("刻み", "step", d.step)}
        ${numberField("いちばん重い", "max", d.max)}
      </div>
      <div class="grid-preview">
        <p><span class="hold">${icons.one}1 個・片手ずつ</span>${seq(one)}</p>
        <p><span class="hold">${icons.two}2 個の合計</span>${seq(two)}</p>
      </div>
    </section>

    <section class="card">
      <h2 class="section-title">休憩タイマー</h2>
      <div class="row">
        <label class="field grow">
          <span class="field-label">終わりの音</span>
          <select data-input="timer-sound">
            ${TIMER_SOUNDS.map(([v, l]) => `<option value="${v}" ${state.timerSound === v ? "selected" : ""}>${l}</option>`).join("")}
          </select>
        </label>
        <button class="btn small" data-action="test-sound" type="button">試しに鳴らす</button>
      </div>
      <label class="switch-row">
        <input type="checkbox" data-input="keep-awake" ${state.settings.keepAwake ? "checked" : ""}>
        <span>トレーニング中は画面を消さない</span>
      </label>
      <p class="muted small">iPhone の Web アプリは、画面が消えると音を鳴らせません。画面をつけたままにすると、休憩の終わりで確実に鳴ります。</p>
    </section>

    <section class="card">
      <h2 class="section-title">計画</h2>
      <p class="muted small">${escapeHtml(state.plan ? `${state.plan.title || state.plan.planId}（版 ${state.plan.version ?? "-"}）` : "まだありません")}</p>
      <button class="btn small" data-action="refresh-plan" type="button">${icons.sync}新しい計画を確かめる</button>
    </section>

    <section class="card">
      <h2 class="section-title">記録を PC に渡す</h2>
      <p class="muted small">GitHub に記録を送ると、PC で次のメニュー作りに使えます。</p>
      <p class="status-line">${escapeHtml(syncStatus)}</p>
      <label class="field">
        <span class="field-label">GitHub の鍵（トークン）</span>
        <input data-input="token" type="password" autocomplete="off" placeholder="${sync.token ? "保存ずみ（変えるときだけ入れる）" : "github_pat_..."}">
      </label>
      <div class="btn-row">
        <button class="btn small" data-action="token-save" type="button">鍵を保存</button>
        <label class="btn small file">鍵のファイルを読む<input data-input="token-file" type="file" accept="application/json,.json"></label>
      </div>
      <label class="switch-row">
        <input type="checkbox" data-input="auto-sync" ${sync.auto ? "checked" : ""} ${sync.token ? "" : "disabled"}>
        <span>保存のたびに自動で送る</span>
      </label>
      <div class="btn-row">
        <button class="btn primary small" data-action="sync-now" type="button" ${sync.token ? "" : "disabled"}>${icons.sync}今すぐ送る</button>
        <button class="btn small" data-action="export" type="button">ファイルで書き出す</button>
        ${sync.token ? `<button class="btn small danger-text" data-action="token-clear" type="button">鍵を消す</button>` : ""}
      </div>
    </section>

    <p class="muted small center">筋トレ ${APP_VERSION}</p>
  `;
}

function numberField(label, key, value) {
  return `
    <label class="field">
      <span class="field-label">${label}</span>
      <span class="unit-input"><input data-input="dumbbell" data-key="${key}" inputmode="decimal" value="${escapeHtml(formatKg(value))}"><small>kg</small></span>
    </label>`;
}

function seq(grid) {
  const items = [0, 1, 2, 3].map((i) => formatKg(grid.base + grid.step * i));
  return `<span class="seq">${items.join(" → ")} … ${formatKg(grid.max)}kg</span>`;
}
