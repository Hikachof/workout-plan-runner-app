(() => {
  "use strict";

  const STORAGE_KEY = "workout-plan-runner-v1";
  const state = loadState();
  let activeSession = null;
  let activeStartedAt = null;
  let timerId = null;
  let timerRemaining = 0;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const samplePlanUrl = "./samples/workout_plan.sample.json";
  const fallbackSamplePlan = {
    schemaVersion: "1.0",
    planId: "sample-pwa-plan",
    version: 1,
    createdAt: nowString(),
    startDate: todayString(),
    endDate: todayString(),
    unit: "kg",
    dailyTaskTemplate: [
      { taskId: "daily-chinning", name: "チンニング", target: "10回前後 × 3セット", metrics: ["reps", "sets"], memo: "" },
      { taskId: "daily-hanging-knee-up", name: "ハンギングニーアップ", target: "10回 × 3セット", metrics: ["reps", "sets"], memo: "" },
      { taskId: "daily-plank", name: "プランク", target: "100秒 × 1〜2セット", metrics: ["seconds", "sets"], memo: "" }
    ],
    sessions: [
      {
        sessionPlanId: "sample-day1",
        dayNumber: "Sample",
        dayName: "動作確認",
        scheduledDate: todayString(),
        weekdayHint: "",
        scheduleStatus: "planned",
        isRestDay: false,
        dailyTasksEnabled: true,
        notes: "PWA確認用の汎用サンプル",
        exercises: [
          {
            exerciseId: "sample-dumbbell-press",
            name: "サンプルダンベルプレス",
            plannedWeight: 10,
            weightType: "per_dumbbell",
            plannedReps: "10",
            plannedSets: 2,
            setTargets: [
              { setNumber: 1, weight: 10, reps: "10" },
              { setNumber: 2, weight: 10, reps: "10" }
            ],
            restSeconds: 90,
            formCues: ["フォームを安定させる", "無理をしない"],
            optional: false,
            shortVersionPriority: 1,
            memo: ""
          }
        ]
      }
    ]
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    bindEvents();
    renderAll();
    registerServiceWorker();
  }

  function bindEvents() {
    $$(".tab").forEach((button) => {
      button.addEventListener("click", () => switchTab(button.dataset.tab));
    });

    $("#plan-file-input").addEventListener("change", importPlanFile);
    $("#export-history").addEventListener("click", exportHistory);
    $("#load-sample-plan").addEventListener("click", loadSamplePlan);
    $("#finish-session").addEventListener("click", finishSession);
    $("#clear-history").addEventListener("click", clearHistory);
    $("#install-help").addEventListener("click", () => {
      showToast("Safariの共有メニューから「ホーム画面に追加」を選んでください。");
    });
    $$(".timer-actions [data-timer]").forEach((button) => {
      button.addEventListener("click", () => startTimer(Number(button.dataset.timer)));
    });
    $("#timer-stop").addEventListener("click", stopTimer);
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyState();
    } catch {
      return emptyState();
    }
  }

  function emptyState() {
    return {
      plan: null,
      history: {
        schemaVersion: "1.0",
        exportedAt: nowString(),
        sessions: []
      }
    };
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function switchTab(tab) {
    $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tab));
  }

  function renderAll() {
    renderHome();
    renderPlan();
    renderHistory();
    renderRun();
  }

  function renderHome() {
    const status = $("#plan-status");
    const nextCard = $("#next-session-card");
    const daily = $("#daily-tasks");

    if (!state.plan) {
      status.innerHTML = `<h2>計画未読み込み</h2><p class="muted">ファイル画面から workout_plan.json を読み込んでください。</p>`;
      nextCard.innerHTML = `<div class="empty">次に実行するメニューはありません。</div>`;
      daily.innerHTML = "";
      return;
    }

    status.innerHTML = `
      <div class="section-head">
        <div>
          <h2>${escapeHtml(state.plan.planId)}</h2>
          <p class="muted">${escapeHtml(state.plan.startDate)} - ${escapeHtml(state.plan.endDate)} / version ${state.plan.version}</p>
        </div>
      </div>
    `;

    const next = findNextSession();
    if (!next) {
      nextCard.innerHTML = `<div class="empty">未実施のメニューはありません。</div>`;
    } else {
      nextCard.innerHTML = `
        <div class="section-head">
          <div>
            <p class="eyebrow">Next</p>
            <h2>${escapeHtml(next.dayNumber)} ${escapeHtml(next.dayName)}</h2>
            <p class="muted">${escapeHtml(next.scheduledDate)} ${escapeHtml(next.weekdayHint || "")}</p>
          </div>
          <button class="primary-button" data-start="${escapeHtml(next.sessionPlanId)}" type="button">開始</button>
        </div>
        <div class="pill-row">${next.exercises.map((exercise) => `<span class="pill">${escapeHtml(exercise.name)}</span>`).join("")}</div>
      `;
      $("[data-start]", nextCard).addEventListener("click", () => startSession(next.sessionPlanId, "as_planned"));
    }

    daily.innerHTML = `<div class="daily-list">${(state.plan.dailyTaskTemplate || []).map((task) => `
      <div class="daily-item">
        <strong>${escapeHtml(task.name)}</strong>
        <span class="muted">${escapeHtml(task.target)}</span>
      </div>
    `).join("")}</div>`;
  }

  function renderPlan() {
    const planList = $("#plan-list");
    if (!state.plan) {
      planList.innerHTML = `<div class="empty">計画JSONを読み込んでください。</div>`;
      return;
    }

    planList.innerHTML = `<div class="session-list">${state.plan.sessions.map((session) => `
      <article class="session-item">
        <div class="section-head">
          <div>
            <strong>${escapeHtml(session.dayNumber)} ${escapeHtml(session.dayName)}</strong>
            <p class="muted">${escapeHtml(session.scheduledDate)} ${escapeHtml(session.weekdayHint || "")}</p>
          </div>
          ${session.isRestDay ? `<span class="pill">休息</span>` : `<span class="pill">${session.exercises.length}種目</span>`}
        </div>
        <div>${session.exercises.map((exercise) => `<p class="muted">・${escapeHtml(exercise.name)} ${weightText(exercise)} ${escapeHtml(exercise.plannedReps)}回 × ${exercise.plannedSets}</p>`).join("")}</div>
        ${session.isRestDay ? "" : `
          <div class="session-actions">
            <button data-start="${escapeHtml(session.sessionPlanId)}" data-mode="as_planned" type="button">予定どおり</button>
            <button data-start="${escapeHtml(session.sessionPlanId)}" data-mode="short" type="button">短縮版</button>
          </div>
        `}
      </article>
    `).join("")}</div>`;

    $$("[data-start]", planList).forEach((button) => {
      button.addEventListener("click", () => startSession(button.dataset.start, button.dataset.mode));
    });
  }

  function renderRun() {
    const empty = $("#run-empty");
    const active = $("#run-active");
    if (!activeSession) {
      empty.classList.remove("hidden");
      active.classList.add("hidden");
      return;
    }

    empty.classList.add("hidden");
    active.classList.remove("hidden");
    $("#active-title").textContent = `${activeSession.dayNumber} ${activeSession.dayName}`;
    $("#active-meta").textContent = `${activeSession.executionMode} / ${activeSession.performedAt}`;
    $("#session-notes").value = activeSession.notes || "";
    $("#session-fatigue").value = activeSession.fatigue || "";

    renderRunDailyTasks();
    renderRunExercises();
  }

  function renderRunDailyTasks() {
    const root = $("#run-daily-tasks");
    root.innerHTML = `<div class="daily-list">${activeSession.dailyTasks.map((task, index) => `
      <label class="daily-item">
        <span>${escapeHtml(task.name)}</span>
        <input data-daily="${index}" type="checkbox" ${task.completed ? "checked" : ""}>
      </label>
    `).join("")}</div>`;
    $$("[data-daily]", root).forEach((input) => {
      input.addEventListener("change", () => {
        activeSession.dailyTasks[Number(input.dataset.daily)].completed = input.checked;
      });
    });
  }

  function renderRunExercises() {
    const list = $("#exercise-run-list");
    const template = $("#exercise-template");
    list.innerHTML = "";
    activeSession.exercises.forEach((exercise, exerciseIndex) => {
      const card = template.content.firstElementChild.cloneNode(true);
      $(".exercise-name", card).textContent = exercise.name;
      $(".exercise-weight", card).textContent = weightTypeLabel(exercise.weightType);
      $(".exercise-target", card).textContent = `${weightValueText(exercise.plannedWeight)} / ${exercise.plannedReps}回 × ${exercise.plannedSets}`;
      $(".form-cues", card).innerHTML = (exercise.formCues || []).map((cue) => `<span class="pill">${escapeHtml(cue)}</span>`).join("");
      $(".exercise-memo", card).value = exercise.memo || "";
      $(".exercise-memo", card).addEventListener("input", (event) => {
        exercise.memo = event.target.value;
      });
      $(".skip-exercise", card).addEventListener("click", () => {
        exercise.status = "skipped";
        exercise.sets.forEach((set) => set.completed = false);
        renderRunExercises();
      });
      $(".complete-exercise", card).addEventListener("click", () => {
        exercise.status = "completed";
        exercise.sets.forEach((set) => set.completed = true);
        renderRunExercises();
      });
      $(".add-set", card).addEventListener("click", () => {
        addSet(exercise);
        renderRunExercises();
      });
      renderSetRows($(".sets", card), exercise, exerciseIndex);
      list.appendChild(card);
    });
  }

  function renderSetRows(root, exercise, exerciseIndex) {
    const template = $("#set-template");
    exercise.sets.forEach((set, setIndex) => {
      const row = template.content.firstElementChild.cloneNode(true);
      $(".set-title", row).textContent = `Set ${set.setNumber}`;
      $(".set-weight", row).value = set.actualWeight ?? "";
      $(".set-reps", row).value = set.actualReps ?? "";
      $(".set-rir", row).value = set.rir ?? "";
      $(".set-form", row).value = set.formRating ?? "";
      $(".set-complete", row).textContent = set.completed ? "済" : "完了";
      $(".set-complete", row).classList.toggle("primary-button", set.completed);

      bindNumber(row, ".set-weight", (value) => set.actualWeight = value);
      bindInteger(row, ".set-reps", (value) => set.actualReps = value);
      bindInteger(row, ".set-rir", (value) => set.rir = value);
      bindInteger(row, ".set-form", (value) => set.formRating = value);
      $(".set-complete", row).addEventListener("click", () => {
        set.completed = !set.completed;
        if (set.completed) startTimer(90);
        renderRunExercises();
      });
      root.appendChild(row);
    });
  }

  function bindNumber(root, selector, setter) {
    $(selector, root).addEventListener("input", (event) => {
      const value = event.target.value === "" ? null : Number(event.target.value);
      setter(Number.isFinite(value) ? value : null);
    });
  }

  function bindInteger(root, selector, setter) {
    $(selector, root).addEventListener("input", (event) => {
      const value = event.target.value === "" ? null : parseInt(event.target.value, 10);
      setter(Number.isFinite(value) ? value : null);
    });
  }

  function renderHistory() {
    const root = $("#history-list");
    const sessions = state.history.sessions || [];
    if (!sessions.length) {
      root.innerHTML = `<div class="empty">履歴はありません。</div>`;
      return;
    }
    root.innerHTML = `<div class="history-list">${sessions.map((session) => `
      <article class="history-item">
        <strong>${escapeHtml(session.dayNumber)} ${escapeHtml(session.dayName)}</strong>
        <span class="muted">${escapeHtml(session.performedAt)} / ${Math.round((session.durationSeconds || 0) / 60)}分</span>
        <div class="pill-row">${session.exercises.map((exercise) => `<span class="pill">${escapeHtml(exercise.name)} ${exercise.sets.filter((set) => set.completed).length}set</span>`).join("")}</div>
        ${session.notes ? `<p class="muted">${escapeHtml(session.notes)}</p>` : ""}
      </article>
    `).join("")}</div>`;
  }

  function startSession(sessionPlanId, mode) {
    const sessionPlan = state.plan?.sessions.find((session) => session.sessionPlanId === sessionPlanId);
    if (!state.plan || !sessionPlan) {
      showToast("対象の計画が見つかりません。");
      return;
    }
    activeStartedAt = new Date();
    activeSession = {
      sessionId: `session-${compactNowString()}`,
      planId: state.plan.planId,
      sessionPlanId: sessionPlan.sessionPlanId,
      performedAt: nowString(),
      dayNumber: sessionPlan.dayNumber,
      dayName: sessionPlan.dayName,
      executionMode: mode,
      durationSeconds: 0,
      fatigue: null,
      dailyTasks: (state.plan.dailyTaskTemplate || []).map((task) => ({
        taskId: task.taskId,
        name: task.name,
        completed: false,
        sets: [],
        memo: ""
      })),
      exercises: sessionPlan.exercises.map(createCompletedExercise),
      addedExercises: [],
      skippedExerciseIds: [],
      notes: ""
    };
    switchTab("run");
    renderAll();
  }

  function createCompletedExercise(exercise) {
    const targets = exercise.setTargets?.length
      ? exercise.setTargets
      : Array.from({ length: exercise.plannedSets }, (_, index) => ({
        setNumber: index + 1,
        weight: exercise.plannedWeight,
        reps: exercise.plannedReps
      }));
    return {
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      weightType: exercise.weightType,
      plannedWeight: exercise.plannedWeight,
      plannedReps: exercise.plannedReps,
      plannedSets: exercise.plannedSets,
      status: "planned",
      formCues: exercise.formCues || [],
      sets: targets.map((target) => ({
        setNumber: target.setNumber,
        plannedWeight: target.weight,
        actualWeight: target.weight,
        plannedReps: target.reps,
        actualReps: parseInt(target.reps, 10) || null,
        completed: false,
        rir: null,
        formRating: null,
        pain: "",
        memo: ""
      })),
      memo: exercise.memo || ""
    };
  }

  function addSet(exercise) {
    const previous = exercise.sets[exercise.sets.length - 1];
    exercise.sets.push({
      setNumber: exercise.sets.length + 1,
      plannedWeight: previous?.plannedWeight ?? exercise.plannedWeight,
      actualWeight: previous?.actualWeight ?? exercise.plannedWeight,
      plannedReps: previous?.plannedReps ?? exercise.plannedReps,
      actualReps: previous?.actualReps ?? null,
      completed: false,
      rir: null,
      formRating: null,
      pain: "",
      memo: ""
    });
  }

  function finishSession() {
    if (!activeSession) return;
    activeSession.notes = $("#session-notes").value.trim();
    activeSession.fatigue = $("#session-fatigue").value ? Number($("#session-fatigue").value) : null;
    activeSession.durationSeconds = activeStartedAt ? Math.max(0, Math.round((new Date() - activeStartedAt) / 1000)) : 0;
    activeSession.skippedExerciseIds = activeSession.exercises
      .filter((exercise) => exercise.status === "skipped")
      .map((exercise) => exercise.exerciseId);
    state.history.exportedAt = nowString();
    state.history.sessions.unshift(activeSession);
    activeSession = null;
    activeStartedAt = null;
    stopTimer();
    saveState();
    switchTab("history");
    renderAll();
    showToast("実績を保存しました。");
  }

  async function importPlanFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const plan = JSON.parse(await file.text());
      validatePlan(plan);
      state.plan = plan;
      saveState();
      renderAll();
      switchTab("home");
      showToast("計画JSONを読み込みました。");
    } catch (error) {
      showToast(`読み込み失敗: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  async function loadSamplePlan() {
    try {
      const response = await fetch(samplePlanUrl);
      if (!response.ok) throw new Error("サンプル計画を取得できません。");
      const plan = await response.json();
      validatePlan(plan);
      state.plan = plan;
      saveState();
      renderAll();
      switchTab("home");
      showToast("サンプル計画を読み込みました。");
    } catch (error) {
      state.plan = fallbackSamplePlan;
      saveState();
      renderAll();
      switchTab("home");
      showToast("内蔵サンプル計画を読み込みました。");
    }
  }

  function validatePlan(plan) {
    if (!plan || typeof plan !== "object") throw new Error("JSON形式が不正です。");
    if (!plan.schemaVersion) throw new Error("schemaVersionがありません。");
    if (!plan.planId) throw new Error("planIdがありません。");
    if (!Array.isArray(plan.sessions) || !plan.sessions.length) throw new Error("sessionsが空です。");
  }

  function exportHistory() {
    const payload = {
      ...state.history,
      exportedAt: nowString()
    };
    downloadJson("workout_history.json", payload);
  }

  function clearHistory() {
    if (!confirm("履歴を初期化しますか？")) return;
    state.history = emptyState().history;
    saveState();
    renderAll();
  }

  function downloadJson(filename, payload) {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function findNextSession() {
    const today = todayString();
    return state.plan?.sessions
      .filter((session) => !session.isRestDay && session.scheduledDate >= today)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
      || state.plan?.sessions.find((session) => !session.isRestDay);
  }

  function startTimer(seconds) {
    stopTimer();
    timerRemaining = seconds;
    updateTimerDisplay();
    timerId = window.setInterval(() => {
      timerRemaining = Math.max(0, timerRemaining - 1);
      updateTimerDisplay();
      if (timerRemaining === 0) {
        stopTimer(false);
        showToast("休憩終了です。");
      }
    }, 1000);
  }

  function stopTimer(reset = true) {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
    if (reset) timerRemaining = 0;
    updateTimerDisplay();
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(timerRemaining / 60);
    const seconds = timerRemaining % 60;
    $("#timer-display").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function weightText(exercise) {
    return `${weightValueText(exercise.plannedWeight)} / ${weightTypeLabel(exercise.weightType)}`;
  }

  function weightValueText(value) {
    return value === null || value === undefined ? "自重" : `${value}kg`;
  }

  function weightTypeLabel(value) {
    return {
      per_dumbbell: "片手あたり",
      single_dumbbell: "ダンベル1個",
      left_right_total: "左右合計",
      both_hands_total: "両手総重量",
      bodyweight: "自重",
      bodyweight_plus: "自重+追加",
      none: "重量なし"
    }[value] || value;
  }

  function nowString() {
    return new Date().toISOString();
  }

  function compactNowString() {
    const date = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }

  function todayString() {
    const date = new Date();
    const tzOffset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showToast(message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    window.setTimeout(() => toast.classList.remove("show"), 2600);
  }

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
  }
})();
