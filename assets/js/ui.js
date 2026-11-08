// 画面の小物：アイコン・お知らせ・下から出る板

import { escapeHtml } from "./format.js";
import { holdInfo } from "./weights.js";

const stroke = (d, w = 2.2) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const icons = {
  today: stroke('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>'),
  log: stroke('<path d="M4 19h16M6 15l4-4 3 3 5-6"/>'),
  plan: stroke('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  settings: stroke('<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/>'),
  one: stroke('<path d="M7 8v8M17 8v8M7 12h10"/>', 2.4),
  two: stroke('<path d="M4 5v6M10 5v6M4 8h6M14 13v6M20 13v6M14 16h6"/>', 2.4),
  body: stroke('<circle cx="12" cy="5" r="2"/><path d="M12 8v7M8 11h8M9 21l3-6 3 6"/>', 2.2),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 3),
  plus: stroke('<path d="M12 5v14M5 12h14"/>', 2.6),
  minus: stroke('<path d="M5 12h14"/>', 2.6),
  skip: stroke('<path d="M6 6l8 6-8 6zM18 6v12"/>', 2.2),
  sync: stroke('<path d="M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4"/>'),
  down: stroke('<path d="M6 9l6 6 6-6"/>'),
  trophy: stroke('<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8"/>'),
  arrowUp: stroke('<path d="M12 19V5M6 11l6-6 6 6"/>', 2.6),
};

export function holdBadge(weightType) {
  const info = holdInfo(weightType);
  return `<span class="hold">${icons[info.icon] || icons.one}${escapeHtml(info.label)}</span>`;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

let toastTimer = null;
export function toast(message) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

// 下から出る板（まとめ・確認に使う）。閉じるのは data-action="sheet-close"
export function openSheet(html) {
  const sheet = $("#sheet");
  $(".sheet-body", sheet).innerHTML = html;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("open"));
}

export function closeSheet() {
  const sheet = $("#sheet");
  sheet.classList.remove("open");
  setTimeout(() => { sheet.hidden = true; }, 220);
}

export function emptyState(title, text = "") {
  return `<div class="empty"><p class="empty-title">${escapeHtml(title)}</p>${text ? `<p class="muted">${escapeHtml(text)}</p>` : ""}</div>`;
}

export function downloadJson(filename, payload) {
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
