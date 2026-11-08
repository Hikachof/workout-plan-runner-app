// トレーニング中の画面

import { escapeHtml, formatDate, formatLongDate, todayString } from "../format.js";
import { exerciseKey, lastPerformance } from "../history.js";
import { hasWeight, formatKg, perHandWeight, holdInfo, snapWeight } from "../weights.js";
import { currentSetRef, displayDailyTask, setProgress } from "../session.js";
import { holdBadge, icons } from "../ui.js";

export function renderRun(app) {
  const { state, ui } = app;
  const session = state.activeSession;
  const progress = setProgress(session);
  const current = currentSetRef(session);
  const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
  const allDone = progress.total > 0 && progress.done === progress.total;

  return `
    <header class="page-head">
      <div class="head-row">
        <p class="eyebrow">${escapeHtml(formatLongDate(todayString()))} · ${escapeHtml(session.dayNumber || "")}</p>
        ${progress.total ? `<span class="pill">セット ${progress.done} / ${progress.total}</span>` : ""}
      </div>
      <h1 class="title">${escapeHtml(session.dayName || "トレーニング")}</h1>
      ${progress.total ? `<div class="progress" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${percent}%"></i></div>` : ""}
    </header>

    ${allDone ? `<div class="banner good">${icons.check}<span>メインの種目はぜんぶ終わり！ 下の「終えて保存」で記録します。</span></div>` : ""}

    ${session.exercises.map((exercise, ei) => renderExercise(app, exercise, ei, current)).join("")}

    ${renderDaily(session, ui, state.plan)}

    <section class="card">
      <label class="field">
        <span class="field-label">メモ</span>
        <textarea data-input="notes" rows="3" placeholder="疲れ・痛み・時間が足りなかった など">${escapeHtml(session.notes || "")}</textarea>
      </label>
    </section>

    <button class="btn primary big" data-action="finish" type="button">${icons.check}終えて保存</button>
    <button class="btn text danger-text" data-action="discard" type="button">保存せずにやめる</button>
  `;
}

function renderExercise(app, exercise, ei, current) {
  const { state, ui } = app;
  const clearing = ui.clearingExercise === ei;
  if (exercise.status === "skipped") {
    return `
      <button class="ex-row skipped" data-action="skip" data-ei="${ei}" type="button">
        <span class="mark">${icons.skip}</span>
        <span class="ex-row-name">${escapeHtml(exercise.name)}<small>スキップ中</small></span>
        <span class="ex-row-act">戻す</span>
      </button>`;
  }
  if (exercise.status === "completed" && !clearing && !ui.openExercises.has(ei)) {
    const summary = exercise.sets.filter((s) => s.completed).map((s) => setText(s, exercise)).join("、");
    return `
      <button class="ex-row done" data-action="open-ex" data-ei="${ei}" type="button">
        <span class="mark on">${icons.check}</span>
        <span class="ex-row-name">${escapeHtml(exercise.name)}<small>完了 · ${escapeHtml(summary)}</small></span>
        <span class="ex-row-act">開く</span>
      </button>`;
  }

  const last = lastPerformance(state.history, exerciseKey(exercise), state.activeSession.sessionId);
  const cues = (exercise.formCues || []).filter(Boolean);
  const target = targetText(exercise, state.settings.dumbbell);
  return `
    <article class="card exercise ${clearing ? "clearing" : ""}">
      ${clearing ? `<div class="clear-badge">${icons.check}クリア！</div>` : ""}
      <div class="ex-head">
        <div>
          <h2 class="ex-name">${escapeHtml(exercise.name)}</h2>
          <div class="ex-tags">${holdBadge(exercise.weightType)}<span class="muted small">目標 ${escapeHtml(target)}</span></div>
        </div>
        ${exercise.status === "completed" ? `<button class="btn tiny" data-action="close-ex" data-ei="${ei}" type="button">閉じる</button>` : ""}
      </div>
      ${last ? `<p class="prev">前回 ${escapeHtml(formatDate(last.date))}：${escapeHtml(lastText(last, exercise))}</p>` : `<p class="prev">前回の記録はまだありません</p>`}
      <div class="sets">
        ${exercise.sets.map((set, si) => renderSet(exercise, set, ei, si, current)).join("")}
      </div>
      <div class="ex-foot">
        <button class="btn tiny" data-action="add-set" data-ei="${ei}" type="button">${icons.plus}セット</button>
        <button class="btn tiny" data-action="skip" data-ei="${ei}" type="button">${icons.skip}スキップ</button>
      </div>
      ${cues.length || exercise.memo ? `
        <details class="tips">
          <summary>${icons.down}コツとメモ</summary>
          ${cues.length ? `<ul>${cues.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
          ${exercise.memo ? `<p class="muted small">${escapeHtml(exercise.memo)}</p>` : ""}
        </details>` : ""}
    </article>`;
}

function renderSet(exercise, set, ei, si, current) {
  const isCurrent = current && current.ei === ei && current.si === si;
  const label = `${si + 1} セット目`;
  if (set.completed) {
    return `
      <div class="set done">
        <span class="set-no">${si + 1}</span>
        <span class="set-val">${hasWeight(exercise.weightType) ? `${formatKg(set.actualWeight)}<small>kg</small>` : `<small>自重</small>`}</span>
        <span class="set-val">${set.actualReps ?? "-"}<small>回</small></span>
        <button class="chk on" data-action="set-toggle" data-ei="${ei}" data-si="${si}" type="button" aria-label="${label}を未完了に戻す">${icons.check}</button>
      </div>`;
  }
  const weightCell = hasWeight(exercise.weightType)
    ? stepper("w", ei, si, formatKg(set.actualWeight), perHandWeight(set.actualWeight, exercise.weightType) !== null ? `片手${formatKg(perHandWeight(set.actualWeight, exercise.weightType))}kg` : "kg", "decimal")
    : `<span class="set-val body"><small>自重</small></span>`;
  return `
    <div class="set ${isCurrent ? "current" : ""}">
      <span class="set-no">${si + 1}</span>
      ${weightCell}
      ${stepper("r", ei, si, set.actualReps ?? "", "回", "numeric")}
      <button class="chk" data-action="set-toggle" data-ei="${ei}" data-si="${si}" type="button" aria-label="${label}を完了にする">${icons.check}</button>
    </div>`;
}

function stepper(kind, ei, si, value, unit, mode) {
  const name = kind === "w" ? "重さ" : "回数";
  return `
    <div class="stepper">
      <button data-action="${kind}-dec" data-ei="${ei}" data-si="${si}" type="button" aria-label="${name}を下げる">${icons.minus}</button>
      <label class="stepper-val">
        <input data-input="${kind}" data-ei="${ei}" data-si="${si}" inputmode="${mode}" value="${escapeHtml(value)}" aria-label="${name}">
        <small>${escapeHtml(unit)}</small>
      </label>
      <button data-action="${kind}-inc" data-ei="${ei}" data-si="${si}" type="button" aria-label="${name}を上げる">${icons.plus}</button>
    </div>`;
}

function renderDaily(session, ui, plan) {
  const howTo = new Map((plan?.dailyTaskTemplate || []).map((t) => [t.taskId, t.memo]));
  const tasks = session.dailyTasks || [];
  if (!tasks.length) return "";
  const doneCount = tasks.filter((t) => t.completed).length;
  const rows = tasks.map((task, index) => ({ task: displayDailyTask(task), index }))
    .filter(({ task, index }) => !task.completed || ui.showDoneDaily || ui.clearingDaily.has(index));
  return `
    <section class="daily">
      <div class="section-head">
        <h2 class="section-title">日課</h2>
        <span class="muted small">${doneCount} / ${tasks.length} 完了</span>
      </div>
      ${rows.length ? rows.map(({ task, index }) => `
        <div class="daily-item">
          <button class="daily-row ${task.completed ? "on" : ""} ${ui.clearingDaily.has(index) ? "clearing" : ""}" data-action="daily-toggle" data-i="${index}" type="button" aria-pressed="${task.completed}">
            <span class="box">${task.completed ? icons.check : ""}</span>
            <span class="daily-text"><b>${escapeHtml(task.name)}</b>${task.target ? `<small>${escapeHtml(task.target)}</small>` : ""}</span>
            ${ui.clearingDaily.has(index) ? `<span class="clear-tag">クリア</span>` : ""}
          </button>
          ${howTo.get(task.taskId) ? `<button class="how-btn" data-action="how-to" data-task="${escapeHtml(task.taskId)}" type="button" aria-label="${escapeHtml(task.name)}のやり方">やり方</button>` : ""}
        </div>`).join("") : `<div class="banner good">${icons.check}<span>日課はぜんぶクリア！</span></div>`}
      ${doneCount ? `<button class="btn text" data-action="toggle-done-daily" type="button">${ui.showDoneDaily ? "終わった日課をかくす" : `終わった日課を見る（${doneCount}）`}</button>` : ""}
    </section>`;
}

export function targetText(exercise, dumbbell) {
  const reps = exercise.plannedReps ? `${exercise.plannedReps} 回` : "";
  const sets = exercise.plannedSets ? `${exercise.plannedSets} セット` : "";
  if (!hasWeight(exercise.weightType)) return [reps, sets].filter(Boolean).join(" × ");
  const w = exercise.plannedWeight ?? exercise.sets?.[0]?.plannedWeight;
  return [w !== null && w !== undefined ? `${formatKg(snapWeight(w, exercise.weightType, dumbbell))}kg` : "", reps, sets].filter(Boolean).join(" × ");
}

function setText(set, exercise) {
  const reps = set.actualReps ?? "-";
  return hasWeight(exercise.weightType) ? `${formatKg(set.actualWeight)}kg×${reps}` : `${reps}回`;
}

export function lastText(last, exercise) {
  const sets = last.sets;
  if (!sets.length) return "";
  const sameWeight = sets.every((s) => s.weight === sets[0].weight);
  const reps = sets.map((s) => s.reps ?? "-").join(", ");
  if (!hasWeight(exercise?.weightType ?? last.weightType)) return `${reps} 回${last.allDone ? " ✓" : ""}`;
  if (sameWeight) return `${formatKg(sets[0].weight)}kg × ${reps} 回${last.allDone ? " ✓" : ""}`;
  return sets.map((s) => `${formatKg(s.weight)}kg×${s.reps ?? "-"}`).join("、") + (last.allDone ? " ✓" : "");
}
