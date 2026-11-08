// 「計画」の画面：計画の全部の日と日課

import { escapeHtml, formatDate, formatDateTime } from "../format.js";
import { canStartSession, planEndDate, planStatus } from "../plan.js";
import { latestRecordFor } from "../history.js";
import { emptyState, holdBadge, icons } from "../ui.js";
import { displayDailyTask } from "../session.js";
import { targetText } from "./run.js";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function renderPlan(app) {
  const { state } = app;
  const plan = state.plan;
  const head = `<header class="page-head"><p class="eyebrow">計画</p><h1 class="title">ぜんぶの日</h1></header>`;
  if (!plan) {
    return head + emptyState("計画がまだありません") + `<button class="btn primary big" data-action="refresh-plan" type="button">${icons.sync}計画を読み込む</button>`;
  }
  const today = app.today();
  const status = planStatus(plan, today);
  const start = plan.startDate || plan.sessions[0]?.scheduledDate;

  return `
    ${head}
    <section class="card plan-card">
      <h2 class="preview-title small-title">${escapeHtml(plan.title || plan.planId)}</h2>
      <p class="muted small">${escapeHtml(formatDate(start))}〜${escapeHtml(formatDate(planEndDate(plan)))} · 版 ${escapeHtml(plan.version ?? "-")}${state.lastSyncAt ? ` · ${escapeHtml(formatDateTime(state.lastSyncAt))} に確認` : ""}</p>
      ${status === "ended" ? `<p class="tag-warn">${icons.plan}期間は終わりました</p>` : ""}
      <button class="btn small" data-action="refresh-plan" type="button">${icons.sync}新しい計画を確かめる</button>
    </section>

    <div class="day-list">
      ${plan.sessions.map((session) => renderDay(app, session, today)).join("")}
    </div>

    ${(plan.dailyTaskTemplate || []).length ? `
      <section class="daily">
        <div class="section-head"><h2 class="section-title">日課</h2><span class="muted small">メインとは別。できる範囲で</span></div>
        ${plan.dailyTaskTemplate.map((task) => {
          const view = displayDailyTask(task);
          return `<div class="daily-row static"><span class="daily-text"><b>${escapeHtml(view.name)}</b>${view.target ? `<small>${escapeHtml(view.target)}</small>` : ""}</span></div>`;
        }).join("")}
      </section>` : ""}
  `;
}

function renderDay(app, session, today) {
  const { state } = app;
  const record = latestRecordFor(state.history, session.sessionPlanId);
  const isToday = session.scheduledDate === today;
  const [y, m, d] = String(session.scheduledDate || "").split("-").map(Number);
  const weekday = y ? WEEKDAYS[new Date(y, m - 1, d).getDay()] : "";
  const mark = record
    ? `<span class="day-mark on" title="やった">${icons.check}</span>`
    : isToday ? `<span class="day-mark today">今日</span>` : `<span class="day-mark"></span>`;
  const exercises = session.isRestDay ? [] : session.exercises || [];
  return `
    <details class="day ${isToday ? "is-today" : ""} ${record ? "is-done" : ""}">
      <summary>
        ${mark}
        <span class="day-date">${escapeHtml(formatDate(session.scheduledDate))}<small>${escapeHtml(weekday)}</small></span>
        <span class="day-name"><b>${escapeHtml(session.dayName || "")}</b><small>${escapeHtml(session.isRestDay ? "休み" : exercises.map((e) => e.name).join("・"))}</small></span>
        ${icons.down}
      </summary>
      <div class="day-body">
        ${exercises.map((e) => `<div class="day-ex"><b>${escapeHtml(e.name)}</b><div class="ex-tags">${holdBadge(e.weightType)}<span class="muted small">${escapeHtml(targetText(e, state.settings.dumbbell))}</span></div></div>`).join("")}
        ${record ? `<p class="muted small">${escapeHtml(formatDateTime(record.performedAt))} にやりました</p>` : ""}
        ${canStartSession(state.plan, session) ? `<button class="btn primary" data-action="start" data-id="${escapeHtml(session.sessionPlanId)}" type="button">${icons.today}この日をやる</button>` : ""}
      </div>
    </details>`;
}
