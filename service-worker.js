const APP_VERSION = "1.1.7";
const CACHE_NAME = `surpresso-cache-${APP_VERSION}`;

// ===== INSTALL =====
self.addEventListener("install", event => {
  self.skipWaiting(); // сразу активируем новый SW

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled([
        "/",
        "/index.html?v=" + APP_VERSION,
        "/equipment.html?v=" + APP_VERSION,
        "/style.css?v=" + APP_VERSION,
        "/gradient.css?v=" + APP_VERSION,
        "/app.js?v=" + APP_VERSION,
        "/manifest.json?v=" + APP_VERSION,
        "/manuals",
        "/manuals/index.html?v=" + APP_VERSION,
        "/manuals/styles.css?v=" + APP_VERSION,
        "/manuals/app.js?v=" + APP_VERSION,
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
      ].map(resource => cache.add(resource)))
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

  // ✅ cache-first для viewer-ассетов и PDF/manual requests
  event.respondWith(
    caches.match(request).then(async cachedResponse => {
      if (cachedResponse) return cachedResponse;

      const networkResponse = await fetch(request);
      if (shouldRuntimeCache && networkResponse.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }).catch(async () => {
      const fallback = await caches.match(request);
      if (fallback) return fallback;
      throw new Error("network_and_cache_failed");
    })
  );
});
