// Адрес настоящего сервера (BACKEND.md §9.1). Сборка с NEXT_PUBLIC_API_URL —
// режим remote; без переменной — демо, как раньше (lan или local).
//
// В BACKEND.md пример адреса — с /v1 на конце (https://api.<домен>/v1), а
// при разработке удобнее без него (http://localhost:4100). Принимаем оба:
// храним адрес без /v1 и сами дописываем версию к каждому пути.
//
// Особое значение same-origin (auto-tasks-pm-4 S02): API на том же адресе,
// что и страница (контейнер web проксирует /v1 и /s/ на сервер). Адрес
// берётся из window.location.origin при запуске, поэтому одна сборка
// работает на любом домене и домен не вшит в образ.
export const SAME_ORIGIN = "same-origin";

export const parseRemoteApiBase = (
  raw: string | undefined,
  pageOrigin?: string,
): null | string => {
  const text = raw?.trim();
  if (!text) return null;
  if (text === SAME_ORIGIN) {
    if (!pageOrigin) {
      throw new Error(
        "NEXT_PUBLIC_API_URL=same-origin — адрес страницы неизвестен",
      );
    }
    return parseRemoteApiBase(pageOrigin);
  }
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // Опечатка в адресе не должна молча превратить продукт в демо: человек
    // создал бы профиль в браузере и потом потерял его. Пусть запуск упадёт.
    throw new Error(`NEXT_PUBLIC_API_URL — не адрес: «${text}»`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`NEXT_PUBLIC_API_URL — нужен http(s): «${text}»`);
  }
  const path = url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "");
  return `${url.origin}${path}`;
};

let cached: null | string | undefined;

// Next подставляет NEXT_PUBLIC_* при сборке — читать надо именно так,
// полным именем, а не через process.env[name].
export const getRemoteApiBase = (): null | string => {
  if (cached === undefined) {
    const raw = process.env.NEXT_PUBLIC_API_URL;
    const page = typeof window === "undefined" ? undefined : window.location;
    // same-origin при сборке страниц (без window): адреса ещё нет, и
    // запоминать нечего — в браузере он появится.
    if (raw?.trim() === SAME_ORIGIN && !page) return null;
    cached = parseRemoteApiBase(raw, page?.origin);
  }
  return cached;
};

// Сборка для настоящего сервера — известно до запуска вкладки: по этому
// флагу не качаем заранее мок-сервер и каталог (shared/api/warmup.ts).
export const isRemoteBuild = (): boolean =>
  Boolean(process.env.NEXT_PUBLIC_API_URL?.trim());

// /me → <адрес>/v1/me.
export const remoteApiUrl = (base: string, path: string) => `${base}/v1${path}`;

// WebSocket того же сервера: http → ws, https → wss (BACKEND.md §5).
export const remoteWsUrl = (base: string) =>
  `${base.replace(/^http/, "ws")}/v1/ws`;
