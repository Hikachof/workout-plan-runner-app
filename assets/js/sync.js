// GitHub への記録の同期。上書きで記録を失わないように、向こうの記録と合わせてから書く。

import { mergeHistory } from "./history.js";
import { compactNowString, nowString } from "./format.js";

const REPO = { owner: "Hikachof", repo: "workout-plan-runner-app", branch: "main", path: "history/workout_history.json" };
const API = `https://api.github.com/repos/${REPO.owner}/${REPO.repo}/contents/${REPO.path}`;

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2026-03-10",
  };
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function errorText(response, data) {
  return data?.message ? `${response.status} ${data.message}` : `HTTP ${response.status}`;
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(base64) {
  const binary = atob(String(base64 || "").replace(/\s/g, ""));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// 公開ページに置いてある記録（同じ場所から読める。鍵は要らない）
export async function fetchPublishedHistory() {
  const response = await fetch(`./history/workout_history.json?t=${Date.now()}`, { cache: "no-store" });
  if (!response.ok) return null;
  const data = await response.json();
  return data?.sessions ? data : null;
}

// 向こうの記録を読み → 手元と合わせ → 書く。合わせた記録を返す
export async function pushHistory(token, localHistory) {
  const getResponse = await fetch(`${API}?ref=${encodeURIComponent(REPO.branch)}&t=${Date.now()}`, { headers: headers(token) });
  const remote = await readJson(getResponse);
  let sha = null;
  let merged = localHistory;
  if (getResponse.ok) {
    sha = remote.sha || null;
    try {
      merged = mergeHistory(localHistory, JSON.parse(decodeBase64Utf8(remote.content)));
    } catch {
      merged = localHistory;
    }
  } else if (getResponse.status !== 404) {
    throw new Error(errorText(getResponse, remote));
  }

  const payload = { ...merged, exportedAt: nowString() };
  const putResponse = await fetch(API, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify({
      message: `Sync workout history ${compactNowString()}`,
      content: encodeBase64Utf8(JSON.stringify(payload, null, 2)),
      branch: REPO.branch,
      ...(sha ? { sha } : {}),
    }),
  });
  const putData = await readJson(putResponse);
  if (!putResponse.ok) throw new Error(errorText(putResponse, putData));
  return payload;
}
