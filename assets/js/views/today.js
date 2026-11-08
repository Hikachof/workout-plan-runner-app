// 「今日」の画面（トレーニングを始める前）

import { escapeHtml, formatDate, formatDuration, formatLongDate } from "../format.js";
import { canStartSession, findTodaySession, hasDailyTasks, planEndDate, planStatus, suggestNextSession } from "../plan.js";
import { exerciseKey, isExerciseDone, lastPerformance, recordsOnDate } from "../history.js";
import { emptyState, holdBadge, icons } from "../ui.js";
import { lastText, targetText } from "./run.js";

export function renderToday(app) {
  const { state } = app;
  const today = app.today();
  const plan = state.plan;
  const status = planStatus(plan, today);
  const doneToday = recordsOnDate(state.history, today);

  const head = `
    <header class="page-head">
      <p class="eyebrow">${escapeHtml(formatLongDate(today))}</p>
      <h1 class="title">今日</h1>
    </header>`;

  if (status === "none") {
    return head + emptyState("計画がまだありません", "下のボタンで計画を読み込みます。")
      + `<button class="btn primary big" data-action="refresh-plan" type="button">${icons.sync}計画を読み込む</button>`;
  }

  const todaySession = status === "active" ? findTodaySession(plan, today) : null;
  const session = todaySession && canStartSession(plan, todaySession) ? todaySession : suggestNextSession(plan, state.history);
  const parts = [head];

  if (doneToday.length) parts.push(renderDoneToday(doneToday));

  if (status === "ended") {
    parts.push(`
      <div class="banner warn">
        ${icons.plan}
        <span><b>計画は ${escapeHtml(formatDate(planEndDate(plan)))} で終わりました。</b><br>新しい計画は PC で作ります。それまでは、前の計画の続きをやれます。</span>
      </div>`);
  } else if (status === "before") {
    parts.push(`<div class="banner">${icons.plan}<span>次の計画は ${escapeHtml(formatDate(plan.startDate))} から始まります。</span></div>`);
  } else if (todaySession?.isRestDay && !hasDailyTasks(plan, todaySession)) {
    parts.push(`<div class="banner">${icons.plan}<span>今日は休みの日です。</span></div>`);
  }

  if (session) {
    const label = todaySession && session === todaySession
      ? (doneToday.length ? "もう一度やる" : "始める")
      : "この日を始める";
    const caption = todaySession && session === todaySession ? "今日のメニュー" : status === "before" ? "次の計画の最初の日" : "前回の続き";
    parts.push(renderSessionPreview(app, session, caption, label));
  }

  parts.push(`<button class="btn text" data-action="go" data-tab="plan" type="button">ほかの日を選ぶ</button>`);
  return parts.join("");
}

function renderDoneToday(records) {
  const latest = records[0];
  const exercises = latest.exercises || [];
  const done = exercises.filter(isExerciseDone).length;
  const daily = latest.dailyTasks || [];
  return `
    <section class="card done-card">
      <div class="done-head"><span class="mark on">${icons.check}</span><div><b>今日はもう記録しました</b><p class="muted small">${escapeHtml([
        latest.dayName,
        exercises.length ? `種目 ${done}/${exercises.length}` : "",
        daily.length ? `日課 ${daily.filter((t) => t.completed).length}/${daily.length}` : "",
        formatDuration(latest.durationSeconds),
      ].filter(Boolean).join(" · "))}</p></div></div>
    </section>`;
}

function renderSessionPreview(app, session, caption, label) {
  const { state } = app;
  const plan = state.plan;
  const exercises = session.isRestDay ? [] : session.exercises || [];
  const dailyCount = hasDailyTasks(plan, session) ? (plan.dailyTaskTemplate || []).length : 0;
  return `
    <section class="card session-preview">
      <p class="eyebrow">${escapeHtml(caption)} · ${escapeHtml(session.dayNumber || "")}${session.scheduledDate ? ` · 予定 ${escapeHtml(formatDate(session.scheduledDate))}` : ""}</p>
      <h2 class="preview-title">${escapeHtml(session.dayName || "")}</h2>
      <ul class="preview-list">
        ${exercises.map((exercise) => {
          const last = lastPerformance(state.history, exerciseKey(exercise), null);
          return `
          <li>
            <div class="preview-ex">
              <b>${escapeHtml(exercise.name)}</b>
              <div class="ex-tags">${holdBadge(exercise.weightType)}<span class="muted small">${escapeHtml(targetText(exercise, state.settings.dumbbell))}</span></div>
              ${last ? `<p class="prev">前回 ${escapeHtml(formatDate(last.date))}：${escapeHtml(lastText(last, exercise))}</p>` : ""}
            </div>
          </li>`;
        }).join("")}
        ${dailyCount ? `<li class="preview-daily">${icons.check}<span>日課 ${dailyCount} 個</span></li>` : ""}
      </ul>
      ${session.notes ? `<details class="tips"><summary>${icons.down}この日のねらい</summary><p class="muted small">${escapeHtml(session.notes)}</p></details>` : ""}
      <button class="btn primary big" data-action="start" data-id="${escapeHtml(session.sessionPlanId)}" type="button">${icons.today}${escapeHtml(label)}</button>
    </section>`;
}
