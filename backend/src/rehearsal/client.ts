import WebSocket from "ws";

// HTTP- и WebSocket-клиент репетиции (S06): только публичный API сервера,
// к базе не ходит. Считает время ответа по шаблонам маршрутов и все ответы
// не 2xx, которых сценарий не ждал.

export type Person = { id: string; name: string; token: string };

type Method = "DELETE" | "GET" | "PATCH" | "POST";

export type Reply<T> = {
  body: T;
  // Код ошибки сервера (VALIDATION, CONFLICT…), если есть.
  code?: string;
  ok: boolean;
  requestId?: string;
  status: number;
};

export type Unexpected = {
  code?: string;
  message?: string;
  requestId?: string;
  route: string;
  status: number;
};

const TIMEOUT_MS = 15_000;
const USER_AGENT = "swipeit-rehearsal/1";

// «http://host:4100/», «…/v1» — к одному виду: адрес без /v1 и без «/».
export const normalizeBase = (raw: string) =>
  raw.trim().replace(/\/+$/, "").replace(/\/v1$/, "");

const fill = (route: string, params: Record<string, string>) =>
  route.replace(/:([A-Za-z]+)/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`Нет параметра ${name}`);
    return encodeURIComponent(value);
  });

const percentile = (sorted: readonly number[], p: number) =>
  sorted.length === 0
    ? 0
    : (sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ??
      0);

export const createClient = (base: string) => {
  const timings = new Map<string, number[]>();
  const unexpected: Unexpected[] = [];
  // Всё, что человек получил ответами, — для проверки приватности.
  const received = new Map<string, Array<{ body: unknown; route: string }>>();

  const call = async <T = unknown>(
    who: null | Person,
    method: Method,
    route: string,
    options: {
      body?: unknown;
      // Статусы не 2xx, которые сценарий ждёт (409 второй жеребьёвки).
      expect?: readonly number[];
      params?: Record<string, string>;
      query?: Record<string, string>;
      // Ответ до проверок — «проверка проверки» (--inject-leak).
      tamper?: (body: unknown) => unknown;
    } = {},
  ): Promise<Reply<T>> => {
    const path = fill(route, options.params ?? {});
    const query = options.query
      ? `?${new URLSearchParams(options.query).toString()}`
      : "";
    const headers: Record<string, string> = { "user-agent": USER_AGENT };
    if (who) headers.authorization = `Bearer ${who.token}`;
    if (options.body !== undefined)
      headers["content-type"] = "application/json";
    const key = `${method} /v1${route}`;
    const started = performance.now();
    let status = 0;
    let body: unknown = null;
    try {
      const response = await fetch(`${base}/v1${path}${query}`, {
        method,
        headers,
        body:
          options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = response.status;
      const text = await response.text();
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
    } catch (error) {
      body = { code: "OFFLINE", message: String(error) };
    }
    const elapsed = performance.now() - started;
    timings.set(key, [...(timings.get(key) ?? []), elapsed]);
    if (options.tamper) body = options.tamper(body);
    const ok = status >= 200 && status < 300;
    const error =
      typeof body === "object" && body !== null
        ? (body as { code?: unknown; message?: unknown; requestId?: unknown })
        : {};
    const code = typeof error.code === "string" ? error.code : undefined;
    const requestId =
      typeof error.requestId === "string" ? error.requestId : undefined;
    if (!ok && !options.expect?.includes(status)) {
      unexpected.push({
        route: key,
        status,
        ...(code ? { code } : {}),
        ...(typeof error.message === "string"
          ? { message: error.message }
          : {}),
        ...(requestId ? { requestId } : {}),
      });
    }
    if (ok && who) {
      received.set(who.id, [...(received.get(who.id) ?? []), { body, route }]);
    }
    return {
      body: body as T,
      ok,
      status,
      ...(code ? { code } : {}),
      ...(requestId ? { requestId } : {}),
    };
  };

  // Не маршрут контракта: /v1/health, /v1/ops/report.
  const raw = async (path: string, token?: string) => {
    const key = `GET ${path.split("?")[0] ?? path}`;
    const started = performance.now();
    try {
      const response = await fetch(`${base}${path}`, {
        headers: {
          "user-agent": USER_AGENT,
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await response.text();
      return { status: response.status, text };
    } catch (error) {
      return { status: 0, text: String(error) };
    } finally {
      const elapsed = performance.now() - started;
      timings.set(key, [...(timings.get(key) ?? []), elapsed]);
    }
  };

  const latency = () =>
    [...timings.entries()]
      .map(([route, list]) => {
        const sorted = [...list].sort((a, b) => a - b);
        return {
          route,
          count: sorted.length,
          p50: percentile(sorted, 0.5),
          p95: percentile(sorted, 0.95),
        };
      })
      .sort((a, b) => a.route.localeCompare(b.route));

  return {
    call,
    raw,
    latency,
    unexpected,
    receivedBy: (id: string) => received.get(id) ?? [],
  };
};

export type Client = ReturnType<typeof createClient>;

// Сокет человека: hello с токеном → ready, дальше копим события.
export type Socket = {
  close: () => void;
  // Сокет закрылся сам (сервер перезапустился, сеть).
  closed: () => boolean;
  messages: unknown[];
};

export const openSocket = (base: string, person: Person): Promise<Socket> =>
  new Promise((resolve, reject) => {
    const url = `${base.replace(/^http/, "ws")}/v1/ws`;
    const ws = new WebSocket(url, { headers: { "user-agent": USER_AGENT } });
    const messages: unknown[] = [];
    let isClosed = false;
    const timer = setTimeout(() => {
      ws.terminate();
      reject(new Error("сокет не ответил ready за 5 с"));
    }, 5_000);
    ws.on("open", () =>
      ws.send(JSON.stringify({ type: "hello", token: person.token })),
    );
    ws.on("message", (data) => {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      if ((parsed as { type?: unknown }).type === "ready") {
        clearTimeout(timer);
        resolve({
          messages,
          close: () => ws.close(),
          closed: () => isClosed,
        });
        return;
      }
      messages.push(parsed);
    });
    ws.on("close", (code) => {
      isClosed = true;
      clearTimeout(timer);
      reject(new Error(`сокет закрыт: ${code}`));
    });
    ws.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
