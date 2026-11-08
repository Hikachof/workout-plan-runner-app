// 文字・日付の整形（画面に依らない小物）

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function todayString(date = new Date()) {
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffset).toISOString().slice(0, 10);
}

export function localDateOf(isoValue) {
  const date = new Date(isoValue);
  return Number.isNaN(date.getTime()) ? "" : todayString(date);
}

// "2026-11-08" → "11/8"
export function formatDate(value) {
  if (!value) return "";
  const [, month, day] = String(value).split("-");
  return `${Number(month)}/${Number(day)}`;
}

// "2026-11-08" → "11月8日（土）"
export function formatLongDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-").map(Number);
  const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
  return `${month}月${day}日（${weekday}）`;
}

export function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${pad(date.getMinutes())}`;
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds || 0)));
  if (!total) return "";
  const minutes = Math.floor(total / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}時間${minutes % 60 ? `${minutes % 60}分` : ""}`;
  if (minutes) return `${minutes}分`;
  return `${total}秒`;
}

export function formatClock(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds || 0)));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function nowString() {
  return new Date().toISOString();
}

export function compactNowString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function timeValue(isoValue) {
  const date = new Date(isoValue || 0);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}
