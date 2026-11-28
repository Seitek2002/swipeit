import { multiWishlistsOnClient } from "@swipeit/core/config/features";
import { nanoid } from "nanoid";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import {
  type IncomingMessage,
  type Server,
  type ServerResponse,
  createServer,
} from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import qrcode from "qrcode-terminal";
import sirv from "sirv";

import { createDefaultBotEngine } from "@/shared/api/mock-server/bots";
import type { ServerDeps } from "@/shared/api/mock-server/context";
import { ApiError, isApiError } from "@/shared/api/mock-server/errors";
import { isNamelessHuman } from "@/shared/api/mock-server/handlers/users";
import { createCryptoRandom } from "@/shared/api/mock-server/random";
import type { HttpMethod } from "@/shared/api/mock-server/routes";
import { buildSeedDb } from "@/shared/api/mock-server/seed";
import { createMockServer } from "@/shared/api/mock-server/server";

import { writeFileAtomic } from "./adapters/atomic-file";
import { type DbOrigin, createFileDb } from "./adapters/file-db";
import { createFsCatalog } from "./adapters/fs-catalog";
import { createFileSettings } from "./adapters/settings";
import { createWsRealtime } from "./adapters/ws-realtime";
import { parseLanArgs } from "./args";

// Сервер режима «Локальная сеть» (TECH_SPEC §7a): ноутбук раздаёт сборку
// out/ телефонам в той же Wi-Fi, а /api/* обслуживает тем же мок-сервером,
// что работает во вкладке. Отличаются только адаптеры: JSON-файл вместо
// localStorage, WebSocket вместо BroadcastChannel.

const FRONTEND_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const JSON_LIMIT = 6 * 1024 * 1024;
const UPLOAD_LIMIT = 5 * 1024 * 1024;
const RANDOM_ERROR_RATE = 0.1;
const UPLOAD_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const METHODS = new Set<string>(["DELETE", "GET", "PATCH", "POST"]);
// Планировщик дедлайнов (TECH_SPEC §7 «Часы»): раз в 15 секунд.
const EXPIRE_EVERY_MS = 15_000;

export type LanServerOptions = {
  // Боты на сервере (TECH_SPEC §7). В тестах выключаем — им нужны таймеры.
  bots?: boolean;
  catalogDir?: string;
  dataDir?: string;
  host?: string;
  log?: (line: string) => void;
  outDir?: string;
  port: number;
  reset?: boolean;
};

export type LanServer = {
  close(): Promise<void>;
  dbOrigin: DbOrigin;
  port: number;
  serverId: string;
};

// Порт занят другим процессом — CLI печатает понятный текст.
export class PortBusyError extends Error {
  constructor(readonly port: number) {
    super(`Порт ${port} уже занят`);
  }
}

// serverId отличает одну базу от другой: телефон хранит свой userId под
// ключом swipeit:lan:<serverId>:userId (TECH_SPEC §7a). Переживает
// перезапуск, но новая база (--reset, удалили или испортили db.json) — новый
// id, иначе телефоны вспомнили бы пользователей, которых в ней уже нет.
const loadServerId = async (file: string, fresh: boolean) => {
  if (!fresh) {
    try {
      const saved = JSON.parse(await readFile(file, "utf8")) as {
        serverId?: unknown;
      };
      if (typeof saved.serverId === "string" && saved.serverId) {
        return saved.serverId;
      }
    } catch {
      // Нет файла или он битый — выдаём новый.
    }
  }
  const serverId = nanoid(12);
  await writeFileAtomic(file, JSON.stringify({ serverId }, null, 2));
  return serverId;
};

// Тип картинки — по первым байтам, а не по заголовку телефона: так в
// uploads/ не попадёт ничего, кроме картинок, и отдаём верный content-type.
const sniffImage = (data: Buffer): null | string => {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return "image/jpeg";
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex")))
    return "image/png";
  if (data.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  if (data.toString("ascii", 4, 12) === "ftypavif") return "image/avif";
  return null;
};

const readBody = (req: IncomingMessage, limit: number, tooLarge: string) =>
  new Promise<Buffer>((resolve, reject) => {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (declared > limit) {
      req.resume();
      reject(new ApiError(413, "VALIDATION", tooLarge));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Дочитываем до конца, но не копим: иначе телефон получит обрыв
      // соединения вместо понятной ошибки.
      if (size <= limit) chunks.push(chunk);
    });
    req.on("end", () =>
      size > limit
        ? reject(new ApiError(413, "VALIDATION", tooLarge))
        : resolve(Buffer.concat(chunks)),
    );
    req.on("error", reject);
  });

const sendJson = (res: ServerResponse, status: number, data: unknown) => {
  const text = JSON.stringify(data ?? null);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store",
  });
  res.end(text);
};

// Для `next dev` с NEXT_PUBLIC_API_ORIGIN: страница с другого порта ходит
// на этот сервер, браузеру нужны CORS-заголовки. Сеть доверенная — отвечаем
// любому Origin.
const applyCors = (req: IncomingMessage, res: ServerResponse) => {
  const origin = req.headers.origin;
  if (!origin) return;
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-user-id");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PATCH, DELETE, OPTIONS",
  );
  res.setHeader("Access-Control-Max-Age", "600");
};

export const createLanServer = async ({
  port,
  host = "0.0.0.0",
  reset = false,
  bots = true,
  dataDir = path.join(FRONTEND_DIR, ".lan-data"),
  outDir = path.join(FRONTEND_DIR, "out"),
  catalogDir = path.join(FRONTEND_DIR, "public", "catalog"),
  log = console.log,
}: LanServerOptions): Promise<LanServer> => {
  const uploadsDir = path.join(dataDir, "uploads");
  const dbFile = path.join(dataDir, "db.json");
  if (reset) {
    // Чистая база — это и чистые настройки демо (иначе осталась бы
    // перемотка часов от прошлого теста) и без старых фото желаний.
    await rm(dbFile, { force: true });
    await rm(path.join(dataDir, "settings.json"), { force: true });
    await rm(uploadsDir, { recursive: true, force: true });
  }
  await mkdir(uploadsDir, { recursive: true });

  const realtime = createWsRealtime();
  const settings = createFileSettings(path.join(dataDir, "settings.json"));
  const catalog = createFsCatalog({ dir: catalogDir });
  const clock = { now: () => Date.now() + settings.get().clockOffsetMs };
  const random = createCryptoRandom();
  const db = createFileDb({
    file: dbFile,
    createInitial: () => buildSeedDb({ catalog, clock }),
    log,
  });
  const dbOrigin = await db.init();
  const serverId = await loadServerId(
    path.join(dataDir, "server.json"),
    dbOrigin !== "loaded",
  );

  const deps: ServerDeps = {
    mode: "lan",
    catalog,
    clock,
    db,
    // Несколько вишлистов: в демо включено, NEXT_PUBLIC_MULTI_WISHLISTS=0 —
    // выключено (тот же переключатель, что у сборки фронта).
    multiWishlists: multiWishlistsOnClient(
      "lan",
      process.env.NEXT_PUBLIC_MULTI_WISHLISTS,
    ),
    random,
    realtime,
    settings,
  };
  const mock = createMockServer(deps);

  // Боты живут здесь, вкладки в lan их не запускают (TECH_SPEC §7). Ходят в
  // обработчики напрямую, как и в local.
  const engine = createDefaultBotEngine({
    clock,
    db,
    handle: (request) => mock.handle(request),
    publish: (event) => realtime.publish(event),
    random,
    settings,
    subscribe: (handler) => realtime.subscribe(handler),
  });
  if (bots) engine.start();

  const handleApi = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ) => {
    applyCors(req, res);
    const method = req.method ?? "GET";
    if (method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    const apiPath = url.pathname.slice("/api".length) || "/";

    // Маршруты только сервера: их нет в routes.ts, во вкладке они не нужны.
    if (method === "GET" && apiPath === "/health") {
      // shareOrigin — адрес ноутбука в Wi-Fi: ссылки и QR, созданные на
      // самом ноутбуке (страница открыта по localhost), должны вести туда,
      // где их откроют телефоны.
      const [address] = lanAddresses();
      sendJson(res, 200, {
        app: "swipeit",
        mode: "lan",
        serverId,
        now: clock.now(),
        shareOrigin: address
          ? `http://${address}:${req.socket.localPort}`
          : undefined,
      });
      return;
    }
    if (method === "GET" && apiPath === "/presence") {
      // Профили без имени в «В этой сети» не показываем — их никто не
      // узнает (TECH_SPEC §7a). devices — все открытые вкладки, это
      // счётчик устройств демо-панели, а не людей.
      const { users } = await db.read();
      sendJson(res, 200, {
        online: realtime.online().filter((id) => {
          const user = users[id];
          return user !== undefined && !isNamelessHuman(user);
        }),
        devices: realtime.devices(),
      });
      return;
    }
    if (method === "POST" && apiPath === "/uploads") {
      const type = String(req.headers["content-type"] ?? "");
      if (!type.startsWith("image/")) {
        req.resume();
        throw new ApiError(400, "VALIDATION", "Нужна картинка");
      }
      const data = await readBody(req, UPLOAD_LIMIT, "Фото больше 5 МБ");
      if (!sniffImage(data)) {
        throw new ApiError(400, "VALIDATION", "Это не похоже на фото");
      }
      const key = nanoid();
      await writeFileAtomic(path.join(uploadsDir, `${key}.jpg`), data);
      sendJson(res, 200, { key, url: `/api/uploads/${key}` });
      return;
    }
    if (method === "GET" && apiPath.startsWith("/uploads/")) {
      const key = apiPath.slice("/uploads/".length);
      if (!UPLOAD_KEY.test(key))
        throw new ApiError(404, "NOT_FOUND", "Фото не найдено");
      const file = path.join(uploadsDir, `${key}.jpg`);
      const data = await readFile(file).catch(() => null);
      if (!data) throw new ApiError(404, "NOT_FOUND", "Фото не найдено");
      res.writeHead(200, {
        "Content-Type": sniffImage(data) ?? "image/jpeg",
        "Content-Length": data.length,
        // Ключ новый на каждое фото — содержимое по нему не меняется.
        "Cache-Control": "public, max-age=31536000, immutable",
      });
      res.end(data);
      return;
    }

    if (!METHODS.has(method)) {
      throw new ApiError(
        404,
        "NOT_FOUND",
        `Нет такого запроса: ${method} ${apiPath}`,
      );
    }
    const raw =
      method === "GET"
        ? Buffer.alloc(0)
        : await readBody(req, JSON_LIMIT, "Слишком большой запрос");
    let body: unknown;
    if (raw.length > 0) {
      try {
        body = JSON.parse(raw.toString("utf8"));
      } catch {
        throw new ApiError(400, "VALIDATION", "Тело запроса — не JSON");
      }
    }
    // «Случайные ошибки 10%» из демо-панели: во вкладке их делает
    // mockTransport, в lan — сервер (настройки общие). Кроме самих
    // настроек демо, иначе панель перестанет слушаться.
    if (
      settings.get().randomErrors &&
      !apiPath.startsWith("/demo") &&
      random.next() < RANDOM_ERROR_RATE
    ) {
      throw new ApiError(503, "OFFLINE", "Связь пропала. Попробуй ещё раз");
    }
    // Заголовок x-user-id здесь не проверяем: кому нужен профиль, тот сам
    // скажет FORBIDDEN (requireUser), а гостевые маршруты по ссылке
    // (брони, импорт вишлиста, ответы на фильтр) работают и без профиля.
    const userId = String(req.headers["x-user-id"] ?? "").trim() || null;
    const result = await mock.handle({
      method: method as HttpMethod,
      path: apiPath,
      query: Object.fromEntries(url.searchParams),
      body,
      userId,
    });
    sendJson(res, 200, result);
  };

  // Статика сборки. Маршруты с trailingSlash уже лежат как
  // wishlist/index.html — ничего не переписываем (TECH_SPEC §7a).
  const hasBuild = existsSync(path.join(outDir, "index.html"));
  if (!hasBuild) log(`Нет сборки в ${outDir} — страницы не откроются`);
  const serveStatic = hasBuild
    ? sirv(outDir, {
        single: false,
        etag: true,
        dev: false,
        setHeaders: (res, pathname) => {
          // Файлы _next/static с хэшем в имени — навсегда; остальное
          // (HTML) перепроверять, чтобы после пересборки телефоны взяли новое.
          res.setHeader(
            "Cache-Control",
            pathname.startsWith("/_next/static/")
              ? "public, max-age=31536000, immutable"
              : "no-cache",
          );
        },
      })
    : null;
  const notFoundPage = path.join(outDir, "404.html");
  const notFoundHtml = existsSync(notFoundPage)
    ? readFileSync(notFoundPage)
    : null;
  const sendNotFound = (res: ServerResponse) => {
    res.writeHead(404, {
      "Content-Type": notFoundHtml
        ? "text/html; charset=utf-8"
        : "text/plain; charset=utf-8",
    });
    res.end(notFoundHtml ?? "Не найдено");
  };

  const server: Server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://lan");
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      handleApi(req, res, url).catch((error: unknown) => {
        if (isApiError(error)) {
          sendJson(res, error.status, {
            code: error.code,
            message: error.message,
            ...(error.reason ? { reason: error.reason } : {}),
          });
          return;
        }
        console.error(`Ошибка ${req.method} ${url.pathname}:`, error);
        sendJson(res, 500, {
          code: "INTERNAL",
          message: "Что-то сломалось на ноутбуке. Попробуй ещё раз",
        });
      });
      return;
    }
    if (!serveStatic) {
      sendNotFound(res);
      return;
    }
    serveStatic(req, res, () => sendNotFound(res));
  });

  server.on("upgrade", (req, socket, head) => {
    const { pathname } = new URL(req.url ?? "/", "http://lan");
    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }
    realtime.handleUpgrade(req, socket, head);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: NodeJS.ErrnoException) => {
      reject(error.code === "EADDRINUSE" ? new PortBusyError(port) : error);
    };
    server.once("error", onError);
    server.listen(port, host, () => {
      server.off("error", onError);
      resolve();
    });
  }).catch(async (error: unknown) => {
    engine.stop();
    await realtime.close();
    throw error;
  });
  // Планы «До даты» закрываются по часам сервера, даже когда все телефоны
  // спят: вкладки зовут тот же маршрут, только когда открыты. unref — чтобы
  // таймер не держал процесс (тесты, Ctrl+C). Тем же таймером — жеребьёвка
  // Санты по дате (drawAt).
  const expiry = setInterval(() => {
    mock
      .handle({ method: "POST", path: "/plans/expire", userId: null })
      .catch(() => undefined);
    mock
      .handle({ method: "POST", path: "/santa/tick", userId: null })
      .catch(() => undefined);
  }, EXPIRE_EVERY_MS);
  expiry.unref();

  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;

  let closing: null | Promise<void> = null;
  const close = () => {
    closing ??= (async () => {
      clearInterval(expiry);
      engine.stop();
      await realtime.close();
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
      // Дописать начатые записи, чтобы не потерять последнее действие.
      await db.flush();
      await settings.flush();
    })();
    return closing;
  };

  return { close, dbOrigin, port: actualPort, serverId };
};

// Виртуальные адаптеры (WSL, Hyper-V, VirtualBox, VPN) телефону не видны —
// ставим их в конец, Wi-Fi — в начало: QR печатается для первого адреса.
const VIRTUAL =
  /vethernet|virtual|vmware|vbox|wsl|docker|hyper-v|tailscale|zerotier|utun|tun|tap/i;
const WIRELESS = /wi-?fi|wlan|wireless|беспровод|^en0$/i;

export const lanAddresses = (interfaces = os.networkInterfaces()): string[] => {
  const found: Array<{ address: string; rank: number }> = [];
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      // 169.254.* — адрес «сети нет», по нему никто не достучится.
      if (entry.address.startsWith("169.254.")) continue;
      const rank = VIRTUAL.test(name) ? 2 : WIRELESS.test(name) ? 0 : 1;
      found.push({ address: entry.address, rank });
    }
  }
  return found.sort((a, b) => a.rank - b.rank).map(({ address }) => address);
};

const DB_ORIGIN_TEXT: Record<DbOrigin, string> = {
  loaded: "База: продолжаю с прошлого раза (.lan-data/db.json)",
  created: "База: новая, с демо-друзьями",
  broken: "База: старая была повреждена — создал новую с демо-друзьями",
};

const printBanner = (lan: LanServer) => {
  const urls = lanAddresses().map((address) => `http://${address}:${lan.port}`);
  console.log("");
  console.log("SwipeIt — режим «Локальная сеть»");
  console.log(DB_ORIGIN_TEXT[lan.dbOrigin]);
  console.log("");
  if (urls.length === 0) {
    console.log(
      "Сетевых адресов не нашёл — ноутбук не подключён к Wi-Fi? Пока можно открыть на этом ноутбуке:",
    );
    console.log(`  http://localhost:${lan.port}`);
  } else {
    console.log("Открой на телефоне в той же Wi-Fi:");
    urls.forEach((url) => console.log(`  ${url}`));
    console.log("");
    qrcode.generate(urls[0] as string, { small: true }, (qr) =>
      console.log(qr),
    );
    console.log(`На этом ноутбуке: http://localhost:${lan.port}`);
  }
  console.log("");
  console.log(
    "Если телефоны не открывают адрес — разреши Node.js в брандмауэре для частных сетей и проверь, что телефоны в той же Wi-Fi (гостевые сети часто изолируют устройства).",
  );
  console.log(
    "Запускай только в своей домашней или офисной Wi-Fi. В публичных сетях (кафе, коворкинг) данные увидит любой подключённый.",
  );
  console.log("");
  console.log("Остановить: Ctrl+C");
};

const main = async () => {
  let args;
  try {
    args = parseLanArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    console.error("Флаги: --reset (чистая база), --port <номер>");
    process.exit(1);
  }
  let lan: LanServer;
  try {
    lan = await createLanServer(args);
  } catch (error) {
    if (error instanceof PortBusyError) {
      console.error(
        `Порт ${error.port} уже занят — наверное, сервер уже запущен в другом окне. Закрой его или выбери другой порт: npm run lan -- --port ${error.port + 1}`,
      );
      process.exit(1);
    }
    throw error;
  }
  printBanner(lan);

  let stopping = false;
  const stop = () => {
    // Второй Ctrl+C — выйти сразу, не дожидаясь записи.
    if (stopping) process.exit(1);
    stopping = true;
    console.log("\nОстанавливаю сервер…");
    lan.close().then(
      () => process.exit(0),
      (error: unknown) => {
        console.error(error);
        process.exit(1);
      },
    );
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
};

// CLI — только при прямом запуске (`tsx lan/server.ts`); тесты импортируют
// createLanServer и поднимают сервер сами.
const isMain = () => {
  const entry = process.argv[1];
  if (!entry) return false;
  const self = fileURLToPath(import.meta.url);
  const normalize = (file: string) =>
    process.platform === "win32"
      ? path.resolve(file).toLowerCase()
      : path.resolve(file);
  return normalize(entry) === normalize(self);
};

if (isMain()) {
  main().catch((error: unknown) => {
    console.error("Сервер не запустился:", error);
    process.exit(1);
  });
}
