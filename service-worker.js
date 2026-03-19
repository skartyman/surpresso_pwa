const APP_VERSION = "1.1.8";
const CACHE_NAME = `surpresso-cache-${APP_VERSION}`;

// ===== INSTALL =====
const OFFLINE_HTML = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Surpresso offline</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font: 16px/1.5 system-ui, sans-serif;
      background: #0f1115;
      color: #f3f4f6;
    }
    .card {
      width: min(100%, 420px);
      padding: 24px;
      border-radius: 20px;
      background: #171923;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 20px 50px rgba(0,0,0,0.35);
    }
    h1 { margin: 0 0 12px; font-size: 24px; }
    p { margin: 0 0 10px; color: #d1d5db; }
    strong { color: #fff; }
  </style>
</head>
<body>
  <main class="card">
    <h1>Нет соединения</h1>
    <p><strong>Surpresso</strong> не смог открыть страницу из сети.</p>
    <p>Попробуйте обновить экран, когда интернет снова появится.</p>
  </main>
</body>
</html>`;

const PRECACHE_URLS = [
  "/",
  "/index.html?v=" + APP_VERSION,
  "/equipment.html?v=" + APP_VERSION,
  "/style.css?v=" + APP_VERSION,
  "/gradient.css?v=" + APP_VERSION,
  "/app.js?v=" + APP_VERSION,
  "/manifest.json?v=" + APP_VERSION,
  "/manuals",
  "/manuals/",
  "/manuals/index.html",
  "/manuals/index.html?v=" + APP_VERSION,
  "/manuals/styles.css?v=" + APP_VERSION,
  "/manuals/app.js?v=" + APP_VERSION,
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js",
];

self.addEventListener("install", event => {
  self.skipWaiting(); // сразу активируем новый SW

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(PRECACHE_URLS.map(resource => cache.add(resource)))
    )
  );
});

// ===== ACTIVATE =====
self.addEventListener("activate", event => {
  event.waitUntil(
    Promise.all([
      // удаляем старые кеши
      caches.keys().then(keys =>
        Promise.all(
          keys.map(key => {
            if (key !== CACHE_NAME) return caches.delete(key);
          })
        )
      ),
      self.clients.claim()
    ])
  );
});

// ===== FETCH =====
function buildOfflineResponse() {
  return new Response(OFFLINE_HTML, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
    status: 503,
    statusText: "Offline",
  });
}

async function cacheFirst(request, shouldCache) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) return cachedResponse;

  const networkResponse = await fetch(request);
  if (shouldCache && networkResponse.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, networkResponse.clone());
  }
  return networkResponse;
}

async function navigationFallback(requestUrl) {
  const fallbackCandidates = requestUrl.pathname.startsWith("/manuals")
    ? ["/manuals", "/manuals/", "/manuals/index.html", "/"]
    : [requestUrl.pathname, "/index.html", "/"];

  for (const candidate of fallbackCandidates) {
    const cachedResponse = await caches.match(candidate);
    if (cachedResponse) return cachedResponse;
  }

  return buildOfflineResponse();
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = request.url;

  if (request.method !== "GET") {
    event.respondWith(fetch(request));
    return;
  }

  // ❌ НИКОГДА не кешируем CSV
  if (url.includes("export?format=csv")) {
    event.respondWith(fetch(request));
    return;
  }

  // ❌ НЕ кешируем иконки и manifest
  if (url.includes("/icons/") || url.includes("manifest.json")) {
    event.respondWith(fetch(request));
    return;
  }

  const requestUrl = new URL(request.url);
  const shouldRuntimeCache =
    requestUrl.pathname.startsWith("/manuals") ||
    /\/api\/manuals\/[^/]+\/file$/.test(requestUrl.pathname) ||
    requestUrl.origin === "https://cdnjs.cloudflare.com";

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const networkResponse = await fetch(request);
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(request, networkResponse.clone());
        }
        return networkResponse;
      } catch {
        return navigationFallback(requestUrl);
      }
    })());
    return;
  }

  // ✅ cache-first для viewer-ассетов и PDF/manual requests
  event.respondWith(
    cacheFirst(request, shouldRuntimeCache).catch(() => navigationFallback(requestUrl))
  );
});
