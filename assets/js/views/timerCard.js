// 自分で始めるタイマー（プランク・休憩・静止など）。動いている間は下のタイマーに任せて、ここは出さない

const PRESETS = [30, 60, 90, 120, 180];

export function renderTimerCard(app) {
  if (app.timer?.isVisible()) return "";
  return `
    <section class="card timer-card">
      <div class="timer-card-head"><h2 class="section-title">タイマー</h2><span class="muted small">押すとすぐ始まる</span></div>
      <div class="timer-presets">
        ${PRESETS.map((s) => `<button class="btn tiny" data-action="timer-start" data-sec="${s}" type="button">${s < 60 ? `${s}秒` : s % 60 ? `${Math.floor(s / 60)}分${s % 60}秒` : `${s / 60}分`}</button>`).join("")}
      </div>
    </section>`;
}
