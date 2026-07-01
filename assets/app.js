(() => {
  "use strict";

  const STORAGE_KEY = "workout-runner-state-v2";
  const PLAN_URL = "./plans/current.json";
  const GITHUB_SYNC = {
    owner: "Hikachof",
    repo: "workout-plan-runner-app",
    branch: "main",
    historyPath: "history/workout_history.json"
  };
  const FILE_TIMER_SOUNDS = {
    t01: "./assets/sounds/T01.mp3"
  };

  const state = loadState();
  let activeSession = state.activeSession || null;
  let activeStartedAt = parseStoredDate(state.activeStartedAt);
  if (activeSession && !activeStartedAt) {
    activeStartedAt = parseStoredDate(activeSession.performedAt) || new Date();
  }
  let timerId = null;
  let timerRemaining = restoreTimerRemaining(state.timerRemaining, state.timerStartedAt);
  const resumeTimerOnInit = Boolean(state.timerStartedAt && timerRemaining > 0);
  let timerAlarmId = null;
  let timerAlarmStopId = null;
  let audioContext = null;
  let fileAlarmAudio = null;
  let fileAlarmSoundId = null;
  const questClearDelayMs = 900;
  const clearingDailyTaskKeys = new Set();
  const hiddenDailyTaskKeys = new Set();
  const clearingExerciseKeys = new Set();
  const hiddenExerciseKeys = new Set();
  const questClearTimers = new Map();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    bindEvents();
    restoreQuestClearStateFromActiveSession();
    if (activeSession) switchPanel("run");
    updateTimerDisplay();
    renderAll();
    registerServiceWorker();
    await refreshPlan({ silent: true });
    if (activeSession) {
      switchPanel("run");
      renderAll();
    }
    if (resumeTimerOnInit) startCountdown();
  }

  function bindEvents() {
    $$(".nav-button").forEach((button) => {
      button.addEventListener("click", () => switchPanel(button.dataset.tab));
    });

    $("#refresh-plan").addEventListener("click", () => refreshPlan({ silent: false }));
    $("#export-history").addEventListener("click", exportHistory);
    $("#save-github-token").addEventListener("click", saveGitHubToken);
    $("#github-token-file").addEventListener("change", importGitHubTokenFile);
    $("#clear-github-token").addEventListener("click", clearGitHubToken);
    $("#sync-history-now").addEventListener("click", () => syncHistoryToGitHub({ silent: false }));
    $("#auto-sync-history").addEventListener("change", (event) => {
      state.githubSync.auto = event.target.checked;
      saveState();
      renderGitHubSync();
    });
    $("#start-today").addEventListener("click", () => {
      const session = findTodaySession() || findNextSession();
      if (!session || session.isRestDay) {
        showToast("開始できるメニューがありません。");
        return;
      }
      startSession(session.sessionPlanId, "as_planned");
    });
    $("#finish-session").addEventListener("click", finishSession);
    $("#session-notes").addEventListener("input", (event) => {
      if (!activeSession) return;
      activeSession.notes = event.target.value;
      saveState();
    });
    $$(".timer-actions [data-timer-add]").forEach((button) => {
      button.addEventListener("click", () => addTimerSeconds(Number(button.dataset.timerAdd)));
    });
    $("#timer-sound").value = state.timerSound;
    $("#timer-sound").addEventListener("change", (event) => {
      state.timerSound = event.target.value;
      stopTimerAlarm();
      fileAlarmAudio = null;
      fileAlarmSoundId = null;
      saveState();
      primeTimerAudio();
    });
    $("#timer-reset").addEventListener("click", resetTimer);
    $("#timer-stop").addEventListener("click", toggleTimer);
    window.addEventListener("pagehide", saveState);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") saveState();
    });
  }

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved) return normalizeState(saved);
    } catch {
      // Ignore corrupt state and rebuild below.
    }
    return normalizeState({});
  }

  function normalizeState(value) {
    return {
      plan: value.plan || null,
      history: value.history || {
        schemaVersion: "1.0",
        exportedAt: nowString(),
        sessions: []
      },
      lastSyncAt: value.lastSyncAt || null,
      timerSound: value.timerSound || "standard",
      timerRemaining: Math.max(0, Number(value.timerRemaining || 0)),
      timerStartedAt: value.timerStartedAt || null,
      activeSession: value.activeSession || null,
      activeStartedAt: value.activeStartedAt || null,
      githubSync: {
        token: value.githubSync?.token || "",
        auto: Boolean(value.githubSync?.auto),
        lastSyncedAt: value.githubSync?.lastSyncedAt || null,
        lastError: value.githubSync?.lastError || null
      }
    };
  }

  function saveState() {
    state.activeSession = activeSession;
    state.activeStartedAt = activeStartedAt ? activeStartedAt.toISOString() : null;
    state.timerRemaining = Math.max(0, Math.round(timerRemaining));
    state.timerStartedAt = timerId ? nowString() : null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function parseStoredDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function restoreTimerRemaining(remaining, startedAt) {
    const base = Math.max(0, Number(remaining || 0));
    const startedDate = parseStoredDate(startedAt);
    if (!startedDate || base <= 0) return base;
    const elapsedSeconds = Math.max(0, Math.round((new Date() - startedDate) / 1000));
    return Math.max(0, base - elapsedSeconds);
  }

  async function refreshPlan({ silent }) {
    setSyncStatus("計画を確認中");
    try {
      const response = await fetch(`${PLAN_URL}?t=${Date.now()}`, {
        cache: "no-store"
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const plan = await response.json();
      validatePlan(plan);

      if (isNewPlan(plan, state.plan)) {
        state.plan = plan;
        state.lastSyncAt = nowString();
        saveState();
        renderAll();
        setSyncStatus("最新計画を読み込みました");
        if (!silent) showToast("最新計画に更新しました。");
      } else {
        state.lastSyncAt = nowString();
        saveState();
        setSyncStatus("計画は最新です");
        if (!silent) showToast("計画は最新です。");
      }
    } catch (error) {
      setSyncStatus(state.plan ? "オフライン: 保存済み計画を使用" : "計画を取得できません");
      if (!silent) showToast(`計画更新に失敗しました: ${error.message}`);
    }
  }

  function validatePlan(plan) {
    if (!plan || typeof plan !== "object") throw new Error("計画JSONが不正です。");
    if (!plan.schemaVersion) throw new Error("schemaVersionがありません。");
    if (!plan.planId) throw new Error("planIdがありません。");
    if (!Array.isArray(plan.sessions) || !plan.sessions.length) throw new Error("sessionsが空です。");
  }

  function isNewPlan(next, current) {
    if (!current) return true;
    if (next.planId !== current.planId) return true;
    return Number(next.version || 0) > Number(current.version || 0);
  }

  function switchPanel(panelName) {
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === panelName));
    $$(".panel").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === panelName));
  }

  function renderAll() {
    renderOverview();
    renderGitHubSync();
    renderToday();
    renderRun();
  }

  function renderOverview() {
    const plan = state.plan;
    const title = $("#overview-title");
    const meta = $("#overview-meta");
    const range = $("#plan-range");
    const list = $("#overview-list");

    if (!plan) {
      title.textContent = "計画未取得";
      meta.textContent = "更新ボタンで最新計画を取得してください。";
      range.textContent = "";
      list.innerHTML = emptyMarkup("計画がまだありません。");
      return;
    }

    title.textContent = plan.title || plan.planId;
    meta.textContent = `Version ${plan.version} / ${plan.planId}`;
    range.textContent = `${formatDate(plan.startDate)} - ${formatDate(plan.endDate)}`;

    list.innerHTML = plan.sessions.map((session) => {
      const isToday = session.scheduledDate === todayString();
      const done = isSessionDone(session.sessionPlanId);
      const exercises = session.exercises || [];
      const className = ["schedule-card", isToday ? "today" : "", done ? "done" : ""].join(" ");
      const tag = session.isRestDay ? "休息" : `${exercises.length}種目`;
      return `
        <article class="${className}">
          <div class="schedule-top">
            <div>
              <h3>${escapeHtml(session.dayNumber)} ${escapeHtml(session.dayName)}</h3>
              <p class="muted">${formatDate(session.scheduledDate)} ${escapeHtml(session.weekdayHint || "")}</p>
            </div>
            <span class="tag ${session.isRestDay ? "rest" : ""}">${done ? "完了" : escapeHtml(tag)}</span>
          </div>
          <div class="tag-row">
            ${exercises.map((exercise) => `<span class="tag">${escapeHtml(exercise.name)}</span>`).join("")}
          </div>
        </article>
      `;
    }).join("");
  }

  function renderGitHubSync() {
    const tokenInput = $("#github-token-input");
    const autoInput = $("#auto-sync-history");
    const manualSyncButton = $("#sync-history-now");
    const status = $("#github-sync-status");
    if (!tokenInput || !autoInput || !manualSyncButton || !status) return;

    tokenInput.value = "";
    tokenInput.placeholder = state.githubSync.token ? "保存済み（変更時だけ入力）" : "fine-grained token";
    autoInput.checked = state.githubSync.auto;
    manualSyncButton.disabled = !state.githubSync.token;

    if (state.githubSync.lastError) {
      status.textContent = `同期失敗: ${state.githubSync.lastError}`;
    } else if (state.githubSync.lastSyncedAt) {
      status.textContent = `同期済み ${formatDateTime(state.githubSync.lastSyncedAt)}`;
    } else if (state.githubSync.token) {
      status.textContent = state.githubSync.auto ? "自動同期ON" : "手動同期のみ";
    } else {
      status.textContent = "未設定";
    }
  }

  function setGitHubSyncStatus(message) {
    const status = $("#github-sync-status");
    if (status) status.textContent = message;
  }

  function saveGitHubToken() {
    const input = $("#github-token-input");
    const token = input.value.trim();
    if (!token) {
      showToast("GitHub tokenを入力してください。");
      return;
    }

    state.githubSync.token = token;
    state.githubSync.lastError = null;
    saveState();
    renderGitHubSync();
    showToast("GitHub tokenをこの端末に保存しました。");
  }

  async function importGitHubTokenFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const tokenConfig = JSON.parse(await file.text());
      const token = String(tokenConfig.token || tokenConfig.githubToken || tokenConfig.GITHUB_TOKEN || "").trim();
      if (!token) throw new Error("tokenが見つかりません。");

      state.githubSync.token = token;
      state.githubSync.lastError = null;
      saveState();
      renderGitHubSync();
      showToast("トークンJSONからGitHub tokenを保存しました。");
    } catch (error) {
      showToast(`トークンJSON読込失敗: ${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  function clearGitHubToken() {
    state.githubSync.token = "";
    state.githubSync.auto = false;
    state.githubSync.lastError = null;
    state.githubSync.lastSyncedAt = null;
    saveState();
    renderGitHubSync();
    showToast("GitHub同期設定を解除しました。");
  }

  function renderToday() {
    const session = findTodaySession() || findNextSession();
    const title = $("#today-title");
    const meta = $("#today-meta");
    const list = $("#today-list");
    const daily = $("#today-daily");
    const startButton = $("#start-today");

    if (!state.plan || !session) {
      title.textContent = "今日のメニューは未取得";
      meta.textContent = "最新計画を更新してください。";
      list.innerHTML = emptyMarkup("表示できるメニューがありません。");
      daily.innerHTML = "";
      startButton.disabled = true;
      return;
    }

    title.textContent = `${session.dayNumber} ${session.dayName}`;
    meta.textContent = `${formatDate(session.scheduledDate)} ${session.weekdayHint || ""}`;
    startButton.disabled = Boolean(session.isRestDay);
    startButton.textContent = session.isRestDay ? "今日は休息日" : "今日のメニューを開始";

    if (session.isRestDay) {
      list.innerHTML = emptyMarkup("今日は休息日です。日課だけ確認してください。");
    } else {
      list.innerHTML = `<div class="exercise-list">${session.exercises.map((exercise, index) => `
        <article class="today-exercise">
          <div class="schedule-top">
            <div>
              <p class="eyebrow">${String(index + 1).padStart(2, "0")}</p>
              <h3>${escapeHtml(exercise.name)}</h3>
              <p class="muted">${weightText(exercise)} / ${escapeHtml(exercise.plannedReps)}回 × ${exercise.plannedSets}</p>
            </div>
            <span class="tag">休憩 ${exercise.restSeconds || 90}秒</span>
          </div>
        </article>
      `).join("")}</div>`;
    }

    daily.innerHTML = renderDailyCards(state.plan.dailyTaskTemplate || []);
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
    $("#active-meta").textContent = `開始 ${formatDateTime(activeSession.performedAt)}`;
    $("#session-notes").value = activeSession.notes || "";

    renderRunDailyTasks();
    renderRunExercises();
  }

  function renderRunDailyTasks() {
    const root = $("#run-daily-tasks");
    if (!activeSession.dailyTasks.length) {
      root.innerHTML = "";
      return;
    }

    const visibleTasks = activeSession.dailyTasks
      .map((task, index) => ({
        task,
        index,
        taskKey: dailyTaskRunKey(task, index)
      }))
      .filter(({ taskKey }) => !hiddenDailyTaskKeys.has(taskKey));

    if (!visibleTasks.length) {
      root.innerHTML = `<div class="empty-state quest-complete"><p>日課クエストクリア！</p></div>`;
      return;
    }

    root.innerHTML = visibleTasks.map(({ task, index, taskKey }) => {
      const isClearing = clearingDailyTaskKeys.has(taskKey);
      return `
      <label class="daily-card${isClearing ? " is-clearing" : ""}">
        <span>${escapeHtml(task.name)}</span>
        <input data-daily="${index}" type="checkbox" ${task.completed ? "checked" : ""} ${isClearing ? "disabled" : ""}>
        ${isClearing ? `<span class="quest-clear-badge">クリア！</span>` : ""}
      </label>
    `;
    }).join("");

    $$("[data-daily]", root).forEach((input) => {
      const handleDailyToggle = () => {
        const taskIndex = Number(input.dataset.daily);
        const task = activeSession.dailyTasks[taskIndex];
        const wasCompleted = task.completed;
        task.completed = input.checked;
        if (task.completed && !wasCompleted) {
          queueDailyTaskClear(dailyTaskRunKey(task, taskIndex));
        } else {
          saveState();
        }
      };
      input.addEventListener("click", handleDailyToggle);
      input.addEventListener("change", handleDailyToggle);
    });
  }

  function renderRunExercises() {
    const list = $("#exercise-run-list");
    const template = $("#exercise-template");
    list.innerHTML = "";

    const visibleExercises = activeSession.exercises
      .map((exercise, exerciseIndex) => ({
        exercise,
        exerciseIndex,
        exerciseKey: exerciseRunKey(exercise, exerciseIndex)
      }))
      .filter(({ exerciseKey }) => !hiddenExerciseKeys.has(exerciseKey));

    if (!visibleExercises.length) {
      list.innerHTML = `<div class="empty-state quest-complete"><p>全クエストクリア！「終了して保存」で履歴に残せます。</p></div>`;
      return;
    }

    visibleExercises.forEach(({ exercise, exerciseKey }) => {
      const card = template.content.firstElementChild.cloneNode(true);
      const isClearing = clearingExerciseKeys.has(exerciseKey);
      card.classList.toggle("is-clearing", isClearing);
      $(".exercise-name", card).textContent = exercise.name;
      $(".exercise-weight", card).textContent = weightTypeLabel(exercise.weightType);
      $(".exercise-target", card).textContent = `${weightValueText(exercise.plannedWeight)} / ${exercise.plannedReps}回 × ${exercise.plannedSets}`;
      $(".form-cues", card).innerHTML = (exercise.formCues || []).map((cue) => `<span class="cue">${escapeHtml(cue)}</span>`).join("");

      $(".skip-exercise", card).addEventListener("click", () => {
        exercise.status = "skipped";
        exercise.sets.forEach((set) => { set.completed = false; });
        saveState();
        renderRunExercises();
      });
      $(".complete-exercise", card).addEventListener("click", () => {
        completeExercise(exercise);
        queueExerciseClear(exerciseKey);
      });
      $(".add-set", card).addEventListener("click", () => {
        addSet(exercise);
        saveState();
        renderRunExercises();
      });

      renderSetRows($(".sets", card), exercise, exerciseKey);
      if (isClearing) {
        $$("button, input, textarea", card).forEach((control) => { control.disabled = true; });
        const clearBadge = document.createElement("div");
        clearBadge.className = "quest-clear-badge";
        clearBadge.textContent = "クリア！";
        card.appendChild(clearBadge);
      }
      list.appendChild(card);
    });
  }

  function renderSetRows(root, exercise, exerciseKey) {
    const template = $("#set-template");
    exercise.sets.forEach((set) => {
      const row = template.content.firstElementChild.cloneNode(true);
      $(".set-label", row).textContent = `Set ${set.setNumber}`;
      $(".set-weight", row).value = set.actualWeight ?? "";
      $(".set-reps", row).value = set.actualReps ?? "";
      const completeButton = $(".set-complete", row);
      completeButton.textContent = set.completed ? "済" : "完了";
      completeButton.classList.toggle("completed", set.completed);

      bindNumber(row, ".set-weight", (value) => { set.actualWeight = value; });
      bindInteger(row, ".set-reps", (value) => { set.actualReps = value; });
      completeButton.addEventListener("click", () => {
        set.completed = !set.completed;
        if (set.completed) startTimer(exercise.restSeconds || 90);
        if (isExerciseComplete(exercise)) {
          completeExercise(exercise);
          queueExerciseClear(exerciseKey);
          return;
        }
        if (exercise.status === "completed") {
          exercise.status = "planned";
        }
        saveState();
        renderRunExercises();
      });
      root.appendChild(row);
    });
  }

  function completeExercise(exercise) {
    exercise.status = "completed";
    exercise.sets.forEach((set) => { set.completed = true; });
  }

  function isExerciseComplete(exercise) {
    return exercise.sets.length > 0 && exercise.sets.every((set) => set.completed);
  }

  function queueExerciseClear(exerciseKey) {
    queueQuestClear(exerciseKey, clearingExerciseKeys, hiddenExerciseKeys, renderRunExercises);
  }

  function queueDailyTaskClear(taskKey) {
    queueQuestClear(taskKey, clearingDailyTaskKeys, hiddenDailyTaskKeys, renderRunDailyTasks);
  }

  function queueQuestClear(questKey, clearingKeys, hiddenKeys, render) {
    if (hiddenKeys.has(questKey)) return;
    clearingKeys.add(questKey);
    if (questClearTimers.has(questKey)) {
      window.clearTimeout(questClearTimers.get(questKey));
    }
    questClearTimers.set(questKey, window.setTimeout(() => {
      clearingKeys.delete(questKey);
      hiddenKeys.add(questKey);
      questClearTimers.delete(questKey);
      saveState();
      render();
    }, questClearDelayMs));
    saveState();
    render();
  }

  function dailyTaskRunKey(task, taskIndex) {
    return `daily:${taskIndex}:${task.taskId || task.name}`;
  }

  function exerciseRunKey(exercise, exerciseIndex) {
    return `exercise:${exerciseIndex}:${exercise.exerciseId || exercise.name}`;
  }

  function resetQuestClearState() {
    questClearTimers.forEach((timer) => window.clearTimeout(timer));
    questClearTimers.clear();
    clearingDailyTaskKeys.clear();
    hiddenDailyTaskKeys.clear();
    clearingExerciseKeys.clear();
    hiddenExerciseKeys.clear();
  }

  function restoreQuestClearStateFromActiveSession() {
    resetQuestClearState();
    if (!activeSession) return;

    activeSession.dailyTasks.forEach((task, taskIndex) => {
      if (task.completed) {
        hiddenDailyTaskKeys.add(dailyTaskRunKey(task, taskIndex));
      }
    });

    activeSession.exercises.forEach((exercise, exerciseIndex) => {
      if (exercise.status === "completed" || isExerciseComplete(exercise)) {
        exercise.status = "completed";
        hiddenExerciseKeys.add(exerciseRunKey(exercise, exerciseIndex));
      }
    });
  }

  function startSession(sessionPlanId, mode) {
    const sessionPlan = state.plan?.sessions.find((session) => session.sessionPlanId === sessionPlanId);
    if (!state.plan || !sessionPlan || sessionPlan.isRestDay) {
      showToast("開始できるメニューがありません。");
      return;
    }

    resetQuestClearState();
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

    saveState();
    switchPanel("run");
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
      restSeconds: exercise.restSeconds || 90,
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
    activeSession.durationSeconds = activeStartedAt ? Math.max(0, Math.round((new Date() - activeStartedAt) / 1000)) : 0;
    activeSession.skippedExerciseIds = activeSession.exercises
      .filter((exercise) => exercise.status === "skipped")
      .map((exercise) => exercise.exerciseId);

    state.history.exportedAt = nowString();
    state.history.sessions.unshift(activeSession);
    resetQuestClearState();
    activeSession = null;
    activeStartedAt = null;
    resetTimer();
    saveState();
    switchPanel("overview");
    renderAll();
    showToast(state.githubSync.auto && state.githubSync.token ? "保存しました。GitHubへ同期します。" : "保存しました。必要な時に記録出力してください。");
    if (state.githubSync.auto && state.githubSync.token) {
      syncHistoryToGitHub({ silent: true });
    }
  }

  function exportHistory() {
    const payload = {
      ...state.history,
      exportedAt: nowString()
    };
    downloadJson("workout_history.json", payload);
  }

  async function syncHistoryToGitHub({ silent }) {
    if (!state.githubSync.token) {
      showToast("GitHub tokenを保存してから同期してください。");
      renderGitHubSync();
      return;
    }

    setGitHubSyncStatus("GitHubへ同期中");
    try {
      const payload = {
        ...state.history,
        exportedAt: nowString()
      };
      const sha = await getGitHubFileSha(GITHUB_SYNC.historyPath);
      const response = await fetch(gitHubContentsUrl(GITHUB_SYNC.historyPath), {
        method: "PUT",
        headers: gitHubHeaders(),
        body: JSON.stringify({
          message: `Sync workout history ${compactNowString()}`,
          content: encodeBase64Utf8(JSON.stringify(payload, null, 2)),
          branch: GITHUB_SYNC.branch,
          ...(sha ? { sha } : {})
        })
      });
      const data = await parseGitHubResponse(response);
      if (!response.ok) throw new Error(gitHubErrorMessage(response, data));

      state.history.exportedAt = payload.exportedAt;
      state.githubSync.lastSyncedAt = nowString();
      state.githubSync.lastError = null;
      saveState();
      renderGitHubSync();
      if (!silent) showToast("GitHubへ同期しました。");
    } catch (error) {
      state.githubSync.lastError = error.message;
      saveState();
      renderGitHubSync();
      showToast(`GitHub同期失敗: ${error.message}`);
    }
  }

  async function getGitHubFileSha(path) {
    const response = await fetch(`${gitHubContentsUrl(path)}?ref=${encodeURIComponent(GITHUB_SYNC.branch)}&t=${Date.now()}`, {
      headers: gitHubHeaders()
    });
    const data = await parseGitHubResponse(response);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(gitHubErrorMessage(response, data));
    return data.sha || null;
  }

  function gitHubContentsUrl(path) {
    return `https://api.github.com/repos/${GITHUB_SYNC.owner}/${GITHUB_SYNC.repo}/contents/${path}`;
  }

  function gitHubHeaders() {
    return {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${state.githubSync.token}`,
      "X-GitHub-Api-Version": "2026-03-10"
    };
  }

  async function parseGitHubResponse(response) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  function gitHubErrorMessage(response, data) {
    return data?.message ? `${response.status} ${data.message}` : `HTTP ${response.status}`;
  }

  function encodeBase64Utf8(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    return btoa(binary);
  }

  function bindNumber(root, selector, setter) {
    $(selector, root).addEventListener("input", (event) => {
      const value = event.target.value === "" ? null : Number(event.target.value);
      setter(Number.isFinite(value) ? value : null);
      saveState();
    });
  }

  function bindInteger(root, selector, setter) {
    $(selector, root).addEventListener("input", (event) => {
      const value = event.target.value === "" ? null : parseInt(event.target.value, 10);
      setter(Number.isFinite(value) ? value : null);
      saveState();
    });
  }

  function findTodaySession() {
    const today = todayString();
    return state.plan?.sessions.find((session) => session.scheduledDate === today) || null;
  }

  function findNextSession() {
    const today = todayString();
    return state.plan?.sessions
      .filter((session) => !session.isRestDay && session.scheduledDate >= today)
      .sort((a, b) => a.scheduledDate.localeCompare(b.scheduledDate))[0]
      || state.plan?.sessions.find((session) => !session.isRestDay)
      || null;
  }

  function isSessionDone(sessionPlanId) {
    return state.history.sessions.some((session) => session.sessionPlanId === sessionPlanId);
  }

  function renderDailyCards(tasks) {
    if (!tasks.length) return emptyMarkup("日課はありません。");
    return tasks.map((task) => `
      <article class="daily-card">
        <h3>${escapeHtml(task.name)}</h3>
        <p class="muted">${escapeHtml(task.target)}</p>
      </article>
    `).join("");
  }

  function emptyMarkup(message) {
    return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
  }

  function startTimer(seconds) {
    stopTimer();
    timerRemaining = seconds;
    startCountdown();
  }

  function addTimerSeconds(seconds) {
    stopTimerAlarm();
    timerRemaining = Math.max(0, timerRemaining + seconds);
    startCountdown();
  }

  function startCountdown() {
    primeTimerAudio();
    stopCountdown();
    if (timerRemaining <= 0) {
      updateTimerDisplay();
      saveState();
      return;
    }

    timerId = window.setInterval(() => {
      timerRemaining = Math.max(0, timerRemaining - 1);
      updateTimerDisplay();
      if (timerRemaining === 0) {
        stopCountdown();
        startTimerAlarm();
        saveState();
        showToast("TIMER終了です。");
      }
    }, 1000);
    updateTimerDisplay();
    saveState();
  }

  function stopCountdown() {
    if (timerId) window.clearInterval(timerId);
    timerId = null;
  }

  function toggleTimer() {
    if (timerAlarmId) {
      stopTimerAlarm();
      saveState();
      return;
    }

    if (timerId) {
      stopTimer();
      return;
    }

    if (timerRemaining > 0) {
      startCountdown();
    }
  }

  function stopTimer() {
    stopCountdown();
    stopTimerAlarm();
    updateTimerDisplay();
    saveState();
  }

  function resetTimer() {
    stopTimer();
    timerRemaining = 0;
    updateTimerDisplay();
    saveState();
  }

  function updateTimerDisplay() {
    const minutes = Math.floor(timerRemaining / 60);
    const seconds = timerRemaining % 60;
    $("#timer-display").textContent = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    $(".timer-card")?.classList.toggle("alarming", Boolean(timerAlarmId));
    updateTimerControlState();
  }

  function updateTimerControlState() {
    const button = $("#timer-stop");
    const paused = timerRemaining > 0 && !timerId && !timerAlarmId;
    button.textContent = paused ? "スタート" : "停止";
    button.disabled = timerRemaining === 0 && !timerId && !timerAlarmId;
  }

  function primeTimerAudio() {
    const context = getAudioContext();
    if (context?.state === "suspended") {
      context.resume().catch(() => {});
    }
    getFileAlarmAudio()?.load();
  }

  function getAudioContext() {
    if (audioContext) return audioContext;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    audioContext = new AudioContextClass();
    return audioContext;
  }

  function startTimerAlarm() {
    stopTimerAlarm();
    playAlarmBeep();
    timerAlarmId = window.setInterval(playAlarmBeep, timerAlarmRepeatMs());
    timerAlarmStopId = window.setTimeout(stopTimerAlarm, 10000);
    updateTimerDisplay();
  }

  function stopTimerAlarm() {
    if (timerAlarmId) window.clearInterval(timerAlarmId);
    if (timerAlarmStopId) window.clearTimeout(timerAlarmStopId);
    timerAlarmId = null;
    timerAlarmStopId = null;
    stopFileAlarmSound();
    updateTimerDisplay();
  }

  function playAlarmBeep() {
    if (playFileAlarmSound()) return;
    playGeneratedAlarmBeep();
  }

  function timerAlarmRepeatMs() {
    return FILE_TIMER_SOUNDS[state.timerSound] ? 1100 : 760;
  }

  function getFileAlarmAudio() {
    const src = FILE_TIMER_SOUNDS[state.timerSound];
    if (!src) return null;
    if (fileAlarmAudio && fileAlarmSoundId === state.timerSound) return fileAlarmAudio;
    fileAlarmSoundId = state.timerSound;
    fileAlarmAudio = new Audio(src);
    fileAlarmAudio.preload = "auto";
    return fileAlarmAudio;
  }

  function playFileAlarmSound() {
    const audio = getFileAlarmAudio();
    if (!audio) return false;

    audio.pause();
    audio.currentTime = 0;
    const playPromise = audio.play();
    if (playPromise?.catch) {
      playPromise.catch(() => playGeneratedAlarmBeep());
    }
    return true;
  }

  function stopFileAlarmSound() {
    if (!fileAlarmAudio) return;
    fileAlarmAudio.pause();
    fileAlarmAudio.currentTime = 0;
  }

  function playGeneratedAlarmBeep() {
    const context = getAudioContext();
    if (!context) return;
    if (context.state === "suspended") {
      context.resume().catch(() => {});
      return;
    }

    for (const tone of timerSoundPattern()) {
      scheduleTone(context, tone);
    }
  }

  function timerSoundPattern() {
    return {
      low: [
        { frequency: 440, startOffset: 0, duration: 0.32, volume: 0.2 }
      ],
      double: [
        { frequency: 880, startOffset: 0, duration: 0.13, volume: 0.18 },
        { frequency: 1175, startOffset: 0.18, duration: 0.13, volume: 0.16 }
      ],
      standard: [
        { frequency: 880, startOffset: 0, duration: 0.25, volume: 0.18 }
      ]
    }[state.timerSound] || [
      { frequency: 880, startOffset: 0, duration: 0.25, volume: 0.18 }
    ];
  }

  function scheduleTone(context, tone) {
    const startAt = context.currentTime;
    const toneStart = startAt + (tone.startOffset || 0);
    const toneEnd = toneStart + tone.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(tone.frequency, toneStart);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(tone.volume || 0.18, toneStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(toneStart + 0.03, toneEnd - 0.01));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd);
  }

  function setSyncStatus(message) {
    $("#sync-status").textContent = message;
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

  function formatDate(value) {
    if (!value) return "";
    const [year, month, day] = value.split("-");
    return `${Number(month)}/${Number(day)}`;
  }

  function formatDateTime(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    const pad = (number) => String(number).padStart(2, "0");
    return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${pad(date.getMinutes())}`;
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
      let reloadingForUpdate = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        window.location.reload();
      });

      navigator.serviceWorker.register("./service-worker.js").then((registration) => {
        registration.update().catch(() => {});
        if (registration.waiting && navigator.serviceWorker.controller) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      }).catch(() => {});
    }
  }
})();
