const CACHE_NAME = "workout-plan-runner-v28";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/base.css",
  "./assets/css/parts.css",
  "./assets/js/main.js",
  "./assets/js/actions.js",
  "./assets/js/store.js",
  "./assets/js/timer.js",
  "./assets/js/sync.js",
  "./assets/js/ui.js",
  "./assets/js/format.js",
  "./assets/js/plan.js",
  "./assets/js/history.js",
  "./assets/js/session.js",
  "./assets/js/weights.js",
  "./assets/js/views/today.js",
  "./assets/js/views/run.js",
  "./assets/js/views/plan.js",
  "./assets/js/views/log.js",
  "./assets/js/views/settings.js",
  "./plans/current.json",
  "./assets/sounds/T01.mp3",
  "./icons/icon.svg",
  "./icons/icon-180.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const path = new URL(event.request.url).pathname;
  if (path.endsWith("/plans/current.json") || path.endsWith("/history/workout_history.json")) {
    event.respondWith(
      fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request.url.split("?")[0], copy));
        return response;
      }).catch(() => caches.match(event.request.url.split("?")[0]))
    );
    return;
  }

  event.respondWith(
    fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => (
      caches.match(event.request).then((cached) => (
        cached || caches.match("./index.html").then((fallback) => fallback || fetch("./index.html").then((response) => {
        const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy));
        return response;
        }))
      ))
    ))
  );
});
