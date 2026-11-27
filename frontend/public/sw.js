// Service worker SwipeIt (TECH_SPEC §11): демо работает без интернета после
// первого визита. Регистрируется только в режиме local и в безопасном
// контексте (HTTPS или localhost) — в «Локальной сети» по http его нет.
//
// - Хешированная статика (_next/static), каталог (catalog/) и иконки —
//   «сначала кэш»: файлы не меняются, а каталог меняется только с новой
//   сборкой (тогда меняется и версия кэша ниже).
// - Страницы и данные страниц — «сначала сеть», без сети — из кэша: так
//   свежая сборка видна сразу, а офлайн открывается то, что уже открывали.
// - /api/ не трогаем: в local его нет (кроме статического health), в lan
//   SW не работает.
const VERSION = "swipeit-v1";
const SCOPE = new URL(self.registration.scope).pathname;

const isCacheFirst = (path) =>
  path.includes("/_next/static/") ||
  path.startsWith(`${SCOPE}catalog/`) ||
  path.startsWith(`${SCOPE}icons/`) ||
  /\.(?:woff2?|png|webp|svg|jpg)$/.test(path);

self.addEventListener("install", (event) => {
  // Стартовую страницу — сразу, чтобы офлайн было что открыть.
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(SCOPE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const cacheFirst = async (request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(VERSION);
    void cache.put(request, response.clone());
  }
  return response;
};

const networkFirst = async (request) => {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(VERSION);
      void cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Страница статического экспорта одна на любой ?id=… — ищем без query.
    const navigate = request.mode === "navigate";
    const cached =
      (await caches.match(request, { ignoreSearch: navigate })) ??
      (navigate ? await caches.match(SCOPE) : undefined);
    if (cached) return cached;
    throw error;
  }
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (!url.pathname.startsWith(SCOPE)) return;
  if (url.pathname.startsWith(`${SCOPE}api/`)) return;
  event.respondWith(
    isCacheFirst(url.pathname) ? cacheFirst(request) : networkFirst(request),
  );
});
