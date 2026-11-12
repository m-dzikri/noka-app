/**
 * Noka Service Worker (RFC-009, STACK-5, OFFLINE-1, OFFLINE-3, OFFLINE-5).
 *
 * Security & cache isolation guarantees:
 * - `noka-shell-v1` (non-private static assets ONLY: `/_next/static/*`, `/icons/*`, `/offline.html`).
 *   Never stores SSR HTML for authenticated `/app/*` routes and persists safely across logout.
 * - `noka-private-v1` (authenticated `/app/*` HTML with `!res.redirected && res.ok` and `/api/attachments/*`).
 *   Wiped completely on logout or `401 UNAUTHORIZED` via `CLEAR_PRIVATE_CACHE` / `caches.delete`.
 * - Zero reliance on `Background Sync API` (unsupported in iOS Safari).
 */

const SHELL_CACHE = "noka-shell-v1";
const PRIVATE_CACHE = "noka-private-v1";
const PRIVATE_CACHE_PREFIX = "noka-private-";
const SHELL_PRECACHE_URLS = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_PRECACHE_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (
              key !== SHELL_CACHE &&
              key !== PRIVATE_CACHE &&
              (key.startsWith("noka-shell-") || key.startsWith(PRIVATE_CACHE_PREFIX))
            ) {
              return caches.delete(key);
            }
            return Promise.resolve(false);
          }),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") {
    return;
  }

  if (data.type === "CLEAR_PRIVATE_CACHE") {
    const clearPromise = caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(PRIVATE_CACHE_PREFIX))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: true });
        }
      })
      .catch(() => {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ ok: false });
        }
      });

    event.waitUntil(clearPromise);
  }
});

function isRscRequest(request, url) {
  return (
    url.searchParams.has("_rsc") ||
    request.headers.get("RSC") === "1" ||
    request.headers.has("Next-Router-State-Tree") ||
    request.headers.has("Next-Router-Prefetch")
  );
}

function isStaticShellAsset(pathname) {
  return (
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/icons/") ||
    pathname === "/offline.html" ||
    pathname === "/manifest.webmanifest"
  );
}

function isProtectedAppRoute(pathname) {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isPrivateAttachmentBinary(pathname) {
  return (
    pathname.startsWith("/api/attachments/") ||
    /^\/api\/notes\/[^/]+\/attachments\/[^/]+$/.test(pathname)
  );
}

function isNeverCachedApi(pathname) {
  return (
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/sync/")
  );
}

function shouldCacheHtmlDocument(response) {
  if (!response || !response.ok || response.redirected || response.status !== 200) {
    return false;
  }
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isNeverCachedApi(url.pathname)) {
    return;
  }

  if (isRscRequest(request, url)) {
    // RSC payload requests stay Network-Only so they never overwrite HTML cache entries.
    return;
  }

  if (isStaticShellAsset(url.pathname)) {
    event.respondWith(
      caches.open(SHELL_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && response.ok && !response.redirected && response.status === 200) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          if (url.pathname === "/offline.html") {
            const offlinePage = await cache.match("/offline.html");
            if (offlinePage) {
              return offlinePage;
            }
          }
          return new Response("Offline asset unavailable", {
            status: 503,
            statusText: "Service Unavailable",
          });
        }
      }),
    );
    return;
  }

  if (isPrivateAttachmentBinary(url.pathname)) {
    event.respondWith(
      caches.open(PRIVATE_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) {
          event.waitUntil(
            fetch(request)
              .then((fresh) => {
                if (fresh && fresh.ok && !fresh.redirected && fresh.status === 200) {
                  return cache.put(request, fresh.clone());
                }
                return undefined;
              })
              .catch(() => undefined),
          );
          return cached;
        }
        try {
          const response = await fetch(request);
          if (response && response.ok && !response.redirected && response.status === 200) {
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          return new Response("Attachment unavailable offline", {
            status: 503,
            statusText: "Service Unavailable",
          });
        }
      }),
    );
    return;
  }

  if (request.mode === "navigate" && isProtectedAppRoute(url.pathname)) {
    event.respondWith(
      (async () => {
        const privateCache = await caches.open(PRIVATE_CACHE);
        try {
          const response = await fetch(request);
          if (shouldCacheHtmlDocument(response)) {
            await privateCache.put(request, response.clone());
          }
          return response;
        } catch {
          const exact = await privateCache.match(request);
          if (exact) {
            return exact;
          }
          if (url.pathname.startsWith("/app/notes/")) {
            const notesShell = await privateCache.match("/app/notes");
            if (notesShell) {
              return notesShell;
            }
          }
          const shellCache = await caches.open(SHELL_CACHE);
          const offlineFallback = await shellCache.match("/offline.html");
          return (
            offlineFallback ||
            new Response("Offline", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })(),
    );
  }
});
