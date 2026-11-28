import {
  type MeResponse,
  TelegramLoginInputSchema,
  type TelegramLoginResult,
  type TelegramNonceResponse,
} from "@swipeit/core/api/users/types";
import { ApiError, conflict, unauthorized } from "@swipeit/core/errors";
import { parseInput } from "@swipeit/core/parse-input";
import { and, count, eq, isNull } from "drizzle-orm";
import {
  createPublicKey,
  type JsonWebKey,
  type KeyObject,
  randomBytes,
  verify,
} from "node:crypto";

import type { ServerContext, ServerHandler } from "../context";
import { identities, users, wishlistItems } from "../db/schema";
import { createUser } from "../domains/users/handlers";
import {
  lockMe,
  rowToUser,
  telegramLinkOf,
  toMe,
} from "../domains/users/queries";
import { createSession, revokeSession } from "./sessions";

// Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03). Telegram Login
// по OpenID Connect: окно Telegram на фронте отдаёт id_token (JWT), сервер
// проверяет подпись по открытым ключам Telegram (JWKS), iss, aud = Client ID
// бота, exp и одноразовый nonce. Без новых пакетов — node:crypto.
//
// Храним sub, время привязки и id аккаунта (claim id — на него пишет бот,
// S10: sub у Telegram OIDC — свой номер, не chat_id). Имя, username и фото
// из токена не читаем и никуда не пишем.

export const TELEGRAM_ISSUER = "https://oauth.telegram.org";
const PROVIDER = "telegram";

const MINUTE = 60_000;
const NONCE_TTL_MS = 10 * MINUTE;
// Больше этого — старые выбрасываем: лимит с IP и так не даёт их накопить.
const NONCE_MAX = 50_000;
const JWKS_TTL_MS = 60 * MINUTE;
// Неизвестный kid (Telegram сменил ключ) — перечитать JWKS, но не чаще раза
// в минуту: подделка с выдуманным kid не должна долбить Telegram.
const JWKS_REFRESH_MIN_MS = MINUTE;
const JWKS_TIMEOUT_MS = 5000;
// Часы сервера и Telegram могут расходиться на несколько секунд.
const CLOCK_SKEW_S = 30;

type Jwk = { alg?: string; kid?: string } & Record<string, unknown>;

// Откуда брать ключи: в production — fetch JWKS, в тестах — свой ключ.
export type JwksSource = () => Promise<readonly Jwk[]>;

export const fetchJwks =
  (url: string): JwksSource =>
  async () => {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(JWKS_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`JWKS Telegram: HTTP ${response.status}`);
    const body = (await response.json()) as { keys?: unknown };
    if (!Array.isArray(body.keys)) throw new Error("JWKS Telegram без keys");
    return body.keys as Jwk[];
  };

// Ключи Telegram ушли — это не «неверный токен», а «попробуй ещё раз».
const telegramUnreachable = () =>
  new ApiError(
    503,
    "OFFLINE",
    "Telegram сейчас не отвечает. Попробуй ещё раз через минуту",
  );

const badToken = () => unauthorized("Не получилось войти через Telegram");

const createJwksCache = (source: JwksSource, now: () => number) => {
  let keys: readonly Jwk[] = [];
  let fetchedAt = Number.NEGATIVE_INFINITY;
  // Последняя попытка скачать, удачная или нет: Telegram не ответил — не
  // спрашиваем его на каждом входе, а раз в минуту.
  let triedAt = Number.NEGATIVE_INFINITY;
  let pending: null | Promise<readonly Jwk[]> = null;
  const load = () => {
    triedAt = now();
    pending ??= source()
      .then((list) => {
        keys = list;
        fetchedAt = now();
        return list;
      })
      .finally(() => {
        pending = null;
      });
    return pending;
  };
  return async (kid: string | undefined): Promise<Jwk | undefined> => {
    const pick = (list: readonly Jwk[]) =>
      kid === undefined
        ? list.length === 1
          ? list[0]
          : undefined
        : list.find((key) => key.kid === kid);
    const canTry = () => now() - triedAt >= JWKS_REFRESH_MIN_MS;
    if (now() - fetchedAt > JWKS_TTL_MS && canTry()) {
      try {
        await load();
      } catch {
        // Есть прежние ключи — проверяем ими.
      }
    }
    // Ключей не было ни разу — Telegram недоступен, а не «токен неверный».
    if (keys.length === 0) throw telegramUnreachable();
    const found = pick(keys);
    if (found || !canTry()) return found;
    try {
      return pick(await load());
    } catch {
      return undefined;
    }
  };
};

// Алгоритмы подписи Telegram (BotFather → Login Widget → Advanced): RS256 по
// умолчанию, ES256, а для openid без profile — EdDSA и ES256K.
const verifySignature = (
  alg: string,
  key: KeyObject,
  data: Buffer,
  signature: Buffer,
): boolean => {
  const curve = key.asymmetricKeyDetails?.namedCurve;
  switch (alg) {
    case "RS256":
      return (
        key.asymmetricKeyType === "rsa" &&
        verify("sha256", data, key, signature)
      );
    case "ES256":
    case "ES256K":
      return (
        key.asymmetricKeyType === "ec" &&
        curve === (alg === "ES256" ? "prime256v1" : "secp256k1") &&
        verify("sha256", data, { key, dsaEncoding: "ieee-p1363" }, signature)
      );
    case "EdDSA":
      return (
        key.asymmetricKeyType === "ed25519" &&
        verify(null, data, key, signature)
      );
    default:
      return false;
  }
};

const decodePart = (part: string): unknown => {
  try {
    return JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
  } catch {
    return null;
  }
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// chatId — claim id (scope profile): id аккаунта Telegram для sendMessage.
export type TelegramClaims = {
  chatId: null | string;
  nonce: string;
  sub: string;
};

export type TelegramAuthOptions = {
  clientId: string;
  jwks: JwksSource;
  now: () => number;
};

export const createTelegramAuth = ({
  clientId,
  jwks,
  now,
}: TelegramAuthOptions) => {
  const keyFor = createJwksCache(jwks, now);
  // Выданные nonce → когда истекают. В памяти процесса: копия API одна
  // (B18), как и лимиты.
  const nonces = new Map<string, number>();

  const sweep = () => {
    const at = now();
    for (const [nonce, expiresAt] of nonces) {
      if (expiresAt <= at) nonces.delete(nonce);
    }
    while (nonces.size >= NONCE_MAX) {
      const oldest = nonces.keys().next().value;
      if (oldest === undefined) break;
      nonces.delete(oldest);
    }
  };

  const issueNonce = (): string => {
    sweep();
    const nonce = randomBytes(18).toString("base64url");
    nonces.set(nonce, now() + NONCE_TTL_MS);
    return nonce;
  };

  // Забрать nonce: есть и не истёк — true, и его больше нет. Вернуть —
  // если вход ничего не изменил (ответ confirm).
  const takeNonce = (nonce: string): null | number => {
    const expiresAt = nonces.get(nonce);
    nonces.delete(nonce);
    return expiresAt !== undefined && expiresAt > now() ? expiresAt : null;
  };
  const returnNonce = (nonce: string, expiresAt: number) => {
    if (expiresAt > now()) nonces.set(nonce, expiresAt);
  };

  // Подпись, iss, aud, exp. Ошибка — 401 без подробностей: что именно не
  // так, человеку не поможет, а подделывающему подскажет.
  const verifyIdToken = async (idToken: string): Promise<TelegramClaims> => {
    const parts = idToken.split(".");
    if (parts.length !== 3) throw badToken();
    const [headerPart = "", payloadPart = "", signaturePart = ""] = parts;
    const header = decodePart(headerPart);
    const claims = decodePart(payloadPart);
    if (!isObject(header) || !isObject(claims)) throw badToken();
    const { alg, kid } = header;
    if (typeof alg !== "string") throw badToken();
    if (kid !== undefined && typeof kid !== "string") throw badToken();

    const jwk = await keyFor(kid);
    if (!jwk || (jwk.alg !== undefined && jwk.alg !== alg)) throw badToken();
    let key: KeyObject;
    try {
      key = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    } catch {
      throw badToken();
    }
    const signed = Buffer.from(`${headerPart}.${payloadPart}`);
    const signature = Buffer.from(signaturePart, "base64url");
    let valid = false;
    try {
      valid = verifySignature(alg, key, signed, signature);
    } catch {
      valid = false;
    }
    if (!valid) throw badToken();

    if (claims.iss !== TELEGRAM_ISSUER) throw badToken();
    const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!audiences.some((aud) => String(aud) === clientId)) throw badToken();
    const nowS = now() / 1000;
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S <= nowS) {
      throw badToken();
    }
    if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > nowS) {
      throw badToken();
    }
    const sub =
      typeof claims.sub === "string" || typeof claims.sub === "number"
        ? String(claims.sub)
        : "";
    if (!sub || sub.length > 64) throw badToken();
    if (typeof claims.nonce !== "string" || !claims.nonce) throw badToken();
    const id =
      typeof claims.id === "number" || typeof claims.id === "string"
        ? String(claims.id)
        : "";
    return {
      sub,
      nonce: claims.nonce,
      chatId: /^\d{1,20}$/.test(id) ? id : null,
    };
  };

  // POST /auth/telegram/nonce.
  const nonceHandler: ServerHandler =
    async (): Promise<TelegramNonceResponse> => ({
      nonce: issueNonce(),
    });

  // Желания профиля этого телефона: перед переключением спросить (§3.3).
  const activeWishes = async (ctx: ServerContext, userId: string) => {
    const [row] = await ctx.tx
      .select({ value: count() })
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, userId),
          eq(wishlistItems.status, "active"),
          isNull(wishlistItems.deletedAt),
        ),
      );
    return row?.value ?? 0;
  };

  const linkedMe = (ctx: ServerContext, me: MeResponse): MeResponse => {
    ctx.events.publish({ type: "db:changed", scope: ["users"], id: me.id }, [
      me.id,
    ]);
    return { ...me, telegramLinked: true, telegramBotMessages: true };
  };

  // Вход через Telegram снова — свежий id аккаунта для бота и снятая
  // отметка «бота заблокировали»: окно входа заново спросило bot_access
  // (S10). Переключатель человека не трогаем.
  const refreshIdentity = (ctx: ServerContext, claims: TelegramClaims) =>
    ctx.tx
      .update(identities)
      .set({
        botBlockedAt: null,
        ...(claims.chatId ? { chatId: claims.chatId } : {}),
      })
      .where(
        and(
          eq(identities.provider, PROVIDER),
          eq(identities.subject, claims.sub),
        ),
      );

  // POST /auth/telegram { idToken, confirmSwitch? } (§3.3):
  // - у Telegram нет профиля → привязать к профилю этого телефона;
  // - есть → новая сессия на тот профиль; профиль этого телефона остаётся как
  //   есть, его сессия закрывается (токен телефон всё равно забывает);
  // - профиля нет и здесь («Сессия закончилась») → новый профиль с Telegram.
  const loginHandler: ServerHandler = async (
    ctx,
    { body },
  ): Promise<TelegramLoginResult> => {
    const { idToken, confirmSwitch } = parseInput(
      TelegramLoginInputSchema,
      body,
    );
    const claims = await verifyIdToken(idToken);
    // Забираем nonce сразу, до первого await к базе: два одновременных
    // запроса с одним токеном не пройдут оба.
    const nonceExpiresAt = takeNonce(claims.nonce);
    if (nonceExpiresAt === null) throw badToken();

    const [linked] = await ctx.tx
      .select({ userId: identities.userId })
      .from(identities)
      .innerJoin(users, eq(users.id, identities.userId))
      .where(
        and(
          eq(identities.provider, PROVIDER),
          eq(identities.subject, claims.sub),
          isNull(users.deletedAt),
        ),
      )
      .limit(1);

    if (linked && linked.userId === ctx.userId) {
      const me = await lockMe(ctx);
      await refreshIdentity(ctx, claims);
      return {
        status: "linked",
        me: toMe(rowToUser(me), await telegramLinkOf(ctx.tx, me.id)),
      };
    }

    if (linked) {
      if (ctx.userId && !confirmSwitch) {
        const localWishes = await activeWishes(ctx, ctx.userId);
        if (localWishes > 0) {
          returnNonce(claims.nonce, nonceExpiresAt);
          return { status: "confirm", localWishes };
        }
      }
      const [row] = await ctx.tx
        .select()
        .from(users)
        .where(eq(users.id, linked.userId))
        .limit(1);
      if (!row) throw badToken();
      await refreshIdentity(ctx, claims);
      if (ctx.sessionId) await revokeSession(ctx.tx, ctx.sessionId, ctx.clock);
      const { token } = await createSession(
        ctx.tx,
        row.id,
        ctx.clock,
        ctx.userAgent,
      );
      return {
        status: "switched",
        me: toMe(rowToUser(row), await telegramLinkOf(ctx.tx, row.id)),
        token,
      };
    }

    if (ctx.userId) {
      const me = await lockMe(ctx);
      const [other] = await ctx.tx
        .select({ subject: identities.subject })
        .from(identities)
        .where(
          and(eq(identities.userId, me.id), eq(identities.provider, PROVIDER)),
        )
        .limit(1);
      if (other) {
        throw conflict("Этот профиль уже привязан к другому Telegram");
      }
      // Тот же Telegram в ту же секунду привязали к другому профилю.
      const inserted = await ctx.tx
        .insert(identities)
        .values({
          userId: me.id,
          provider: PROVIDER,
          subject: claims.sub,
          chatId: claims.chatId,
          createdAt: new Date(ctx.clock.now()),
        })
        .onConflictDoNothing()
        .returning({ userId: identities.userId });
      if (inserted.length === 0) {
        throw conflict("Этот Telegram уже привязан к другому профилю");
      }
      return { status: "linked", me: linkedMe(ctx, toMe(rowToUser(me))) };
    }

    // Профиля на этом телефоне нет: новый, сразу с Telegram.
    const created = (await createUser(ctx, {
      body: {},
      params: {},
      query: {},
    })) as { me: MeResponse; token: string };
    await ctx.tx.insert(identities).values({
      userId: created.me.id,
      provider: PROVIDER,
      subject: claims.sub,
      chatId: claims.chatId,
      createdAt: new Date(ctx.clock.now()),
    });
    return {
      status: "created",
      me: { ...created.me, telegramLinked: true, telegramBotMessages: true },
      token: created.token,
    };
  };

  return {
    handlers: {
      "POST /auth/telegram/nonce": nonceHandler,
      "POST /auth/telegram": loginHandler,
    } satisfies Record<string, ServerHandler>,
    verifyIdToken,
  };
};

export type TelegramAuth = ReturnType<typeof createTelegramAuth>;
