// 休憩タイマー。「終わる時刻」で数えるので、画面を消して戻っても残りがずれない。
// 音は前のアプリと同じ 4 種類（標準・低音・二連・T01）。

const FILE_SOUNDS = { t01: "./assets/sounds/T01.mp3" };
const PATTERNS = {
  standard: [{ f: 880, at: 0, d: 0.25, v: 0.18 }],
  low: [{ f: 440, at: 0, d: 0.32, v: 0.2 }],
  double: [{ f: 880, at: 0, d: 0.13, v: 0.18 }, { f: 1175, at: 0.18, d: 0.13, v: 0.16 }],
};
export const TIMER_SOUNDS = [
  ["standard", "標準"],
  ["low", "低い音"],
  ["double", "二連"],
  ["t01", "T01"],
];

export function createTimer({ state, save, onChange }) {
  let tickId = null;
  let alarmId = null;
  let alarmStopId = null;
  let audioContext = null;
  let fileAudio = null;
  let fileAudioId = null;

  const t = () => state.timer;

  function remaining(now = Date.now()) {
    if (t().endAt) return Math.max(0, (t().endAt - now) / 1000);
    return t().pausedRemaining || 0;
  }
  const isRunning = () => Boolean(t().endAt) && remaining() > 0;
  const isAlarming = () => Boolean(alarmId);
  const isPaused = () => !t().endAt && t().pausedRemaining > 0;
  const isVisible = () => isRunning() || isAlarming() || isPaused();

  function start(seconds, label = "") {
    stopAlarm();
    prime();
    t().endAt = Date.now() + seconds * 1000;
    t().pausedRemaining = 0;
    t().total = seconds;
    t().label = label;
    save();
    loop();
  }

  function add(seconds) {
    stopAlarm();
    if (t().endAt) {
      t().endAt = Math.max(Date.now(), t().endAt) + seconds * 1000;
    } else {
      t().endAt = Date.now() + (t().pausedRemaining + seconds) * 1000;
      t().pausedRemaining = 0;
    }
    t().total = Math.max(t().total, remaining());
    save();
    loop();
  }

  function togglePause() {
    if (isAlarming()) return dismiss();
    if (t().endAt) {
      t().pausedRemaining = remaining();
      t().endAt = null;
    } else if (t().pausedRemaining > 0) {
      t().endAt = Date.now() + t().pausedRemaining * 1000;
      t().pausedRemaining = 0;
    }
    save();
    loop();
  }

  function dismiss() {
    stopAlarm();
    t().endAt = null;
    t().pausedRemaining = 0;
    t().total = 0;
    t().label = "";
    save();
    stopLoop();
    onChange();
  }

  function loop() {
    stopLoop();
    onChange();
    if (!t().endAt) return;
    tickId = setInterval(() => {
      if (remaining() <= 0) {
        stopLoop();
        t().endAt = null;
        t().pausedRemaining = 0;
        save();
        startAlarm();
      }
      onChange();
    }, 250);
  }

  function stopLoop() {
    if (tickId) clearInterval(tickId);
    tickId = null;
  }

  // 画面に戻ったとき：残りを数え直す。消えている間に終わっていたら、短く鳴らす
  function resume() {
    if (t().endAt && remaining() <= 0) {
      t().endAt = null;
      save();
      startAlarm();
      onChange();
      return;
    }
    loop();
  }

  function startAlarm() {
    stopAlarm();
    playOnce();
    alarmId = setInterval(playOnce, FILE_SOUNDS[state.timerSound] ? 1100 : 760);
    alarmStopId = setTimeout(() => {
      stopAlarm();
      onChange();
    }, 10000);
    onChange();
  }

  function stopAlarm() {
    if (alarmId) clearInterval(alarmId);
    if (alarmStopId) clearTimeout(alarmStopId);
    alarmId = null;
    alarmStopId = null;
    if (fileAudio) {
      fileAudio.pause();
      fileAudio.currentTime = 0;
    }
  }

  // iPhone は「指で触れたとき」にしか音を準備できないので、ボタンを押すたびに呼ぶ
  function prime() {
    const context = getContext();
    if (context?.state === "suspended") context.resume().catch(() => {});
    getFileAudio()?.load();
  }

  function getContext() {
    if (audioContext) return audioContext;
    const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
    audioContext = Ctx ? new Ctx() : null;
    return audioContext;
  }

  function getFileAudio() {
    const src = FILE_SOUNDS[state.timerSound];
    if (!src) return null;
    if (fileAudio && fileAudioId === state.timerSound) return fileAudio;
    fileAudioId = state.timerSound;
    fileAudio = new Audio(src);
    fileAudio.preload = "auto";
    return fileAudio;
  }

  function playOnce() {
    const audio = getFileAudio();
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.play()?.catch?.(() => beep());
      return;
    }
    beep();
  }

  function beep() {
    const context = getContext();
    if (!context) return;
    if (context.state === "suspended") {
      context.resume().catch(() => {});
      return;
    }
    for (const tone of PATTERNS[state.timerSound] || PATTERNS.standard) {
      const startAt = context.currentTime + tone.at;
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(tone.f, startAt);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(tone.v, startAt + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, Math.max(startAt + 0.03, startAt + tone.d - 0.01));
      osc.connect(gain).connect(context.destination);
      osc.start(startAt);
      osc.stop(startAt + tone.d);
    }
  }

  function testSound() {
    prime();
    playOnce();
  }

  function soundChanged() {
    stopAlarm();
    fileAudio = null;
    fileAudioId = null;
    prime();
  }

  return { start, add, togglePause, dismiss, resume, remaining, isRunning, isAlarming, isPaused, isVisible, prime, testSound, soundChanged };
}
