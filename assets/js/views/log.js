// 「記録」の画面：種目ごとの伸びと、これまでの日

import { escapeHtml, formatDate, formatDuration, localDateOf } from "../format.js";
import { countSessionsInMonth, exerciseCatalog, exerciseSeries, isExerciseDone } from "../history.js";
import { formatKg, hasWeight, holdInfo, round2 } from "../weights.js";
import { emptyState, icons } from "../ui.js";
import { lastText } from "./run.js";

export function renderLog(app) {
  const { state, ui } = app;
  const head = `<header class="page-head"><p class="eyebrow">記録</p><h1 class="title">伸びを見る</h1></header>`;
  const catalog = exerciseCatalog(state.history);
  if (!catalog.length) return head + emptyState("まだ記録がありません", "トレーニングを保存すると、ここに伸びが出ます。");

  const selected = catalog.find((c) => c.key === ui.logKey) || catalog[0];
  const series = exerciseSeries(state.history, selected.key).filter((item) => item.weightType === selected.weightType);
  const weighted = hasWeight(selected.weightType);
  const bests = series.map((s) => s.best).filter((v) => v !== null);
  const top = bests.length ? Math.max(...bests) : null;
  const lastTwo = series.slice(-2);
  const diff = lastTwo.length === 2 && lastTwo[0].best !== null && lastTwo[1].best !== null ? round2(lastTwo[1].best - lastTwo[0].best) : null;

  return `
    ${head}
    <div class="chips" role="tablist">
      ${catalog.map((c) => `<button class="chip ${c.key === selected.key ? "on" : ""}" data-action="log-pick" data-key="${escapeHtml(c.key)}" role="tab" aria-selected="${c.key === selected.key}" type="button">${escapeHtml(c.name)}</button>`).join("")}
    </div>

    <section class="card">
      <p class="muted small">${escapeHtml(weighted ? `${holdInfo(selected.weightType).unitLabel} · その日いちばん重いセット` : "回数")}</p>
      ${weighted ? renderChart(series.slice(-12)) : renderRepsChart(series.slice(-12))}
    </section>

    <div class="stats">
      <div class="stat"><b>${top !== null ? `${formatKg(top)}<small>kg</small>` : "-"}</b><span>いちばん重い</span></div>
      <div class="stat"><b>${diff === null ? "-" : `${diff > 0 ? "＋" : diff < 0 ? "−" : "±"}${formatKg(Math.abs(diff))}`}</b><span>前回から</span></div>
      <div class="stat"><b>${countSessionsInMonth(state.history, app.today())}<small>日</small></b><span>今月やった日</span></div>
    </div>

    <section>
      <div class="section-head"><h2 class="section-title">${escapeHtml(selected.name)}の記録</h2></div>
      <div class="card list">
        ${series.slice().reverse().slice(0, 8).map((item) => `
          <div class="list-row"><span>${escapeHtml(formatDate(item.date))} ${escapeHtml(item.dayName || "")}</span><b>${escapeHtml(lastText(item, { weightType: item.weightType }))}</b></div>`).join("")}
      </div>
    </section>

    <section>
      <div class="section-head"><h2 class="section-title">これまでの日</h2><span class="muted small">${state.history.sessions.length} 回</span></div>
      <div class="card list">
        ${state.history.sessions.slice(0, 20).map((s) => {
          const ex = s.exercises || [];
          const daily = s.dailyTasks || [];
          return `<div class="list-row"><span>${escapeHtml(formatDate(localDateOf(s.performedAt)))} ${escapeHtml(s.dayName || "")}</span><span class="muted small">${escapeHtml([
            ex.length ? `種目 ${ex.filter(isExerciseDone).length}/${ex.length}` : "",
            daily.length ? `日課 ${daily.filter((t) => t.completed).length}/${daily.length}` : "",
            formatDuration(s.durationSeconds),
          ].filter(Boolean).join(" · "))}</span></div>`;
        }).join("")}
      </div>
    </section>
  `;
}

function renderChart(points) {
  const values = points.map((p) => p.best).filter((v) => v !== null);
  if (values.length < 2) return `<p class="chart-empty">${icons.log}2 回以上やると線が出ます</p>`;
  return lineChart(points.map((p) => ({ label: formatDate(p.date), value: p.best })), "kg");
}

function renderRepsChart(points) {
  const data = points.map((p) => ({ label: formatDate(p.date), value: Math.max(0, ...p.sets.map((s) => Number(s.reps) || 0)) }));
  if (data.length < 2) return `<p class="chart-empty">${icons.log}2 回以上やると線が出ます</p>`;
  return lineChart(data, "回");
}

function lineChart(data, unit) {
  const W = 330;
  const H = 150;
  const left = 40;
  const right = 12;
  const top = 14;
  const bottom = 26;
  const values = data.map((d) => d.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) { min -= 2; max += 2; }
  const pad = (max - min) * 0.15;
  min -= pad;
  max += pad;
  const x = (i) => left + (i * (W - left - right)) / Math.max(1, data.length - 1);
  const y = (v) => top + ((max - v) * (H - top - bottom)) / (max - min);
  // 目盛りは、記録にある「いちばん軽い」と「いちばん重い」だけ（半端な数を出さない）
  const ticks = Array.from(new Set([Math.min(...values), Math.max(...values)]));
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(" ");
  const lastIndex = data.length - 1;
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="伸びのグラフ">
      ${ticks.map((v) => `<line class="grid" x1="${left}" x2="${W - right}" y1="${y(v)}" y2="${y(v)}"/><text class="axis" x="${left - 6}" y="${y(v) + 4}" text-anchor="end">${formatKg(round2(v))}</text>`).join("")}
      <path class="line" d="${path}"/>
      ${data.map((d, i) => `<circle class="dot ${i === lastIndex ? "last" : ""}" cx="${x(i)}" cy="${y(d.value)}" r="${i === lastIndex ? 5.5 : 4}"/>`).join("")}
      <text class="axis" x="${x(0)}" y="${H - 6}" text-anchor="start">${escapeHtml(data[0].label)}</text>
      <text class="axis" x="${x(lastIndex)}" y="${H - 6}" text-anchor="end">${escapeHtml(data[lastIndex].label)}</text>
      <text class="axis value" x="${x(lastIndex)}" y="${y(data[lastIndex].value) - 10}" text-anchor="end">${formatKg(data[lastIndex].value)}${unit}</text>
    </svg>`;
}
