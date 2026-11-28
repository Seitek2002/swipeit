import type { FastifyBaseLogger } from "fastify";
import { and, asc, eq, isNotNull, lt, lte } from "drizzle-orm";

import type { Clock } from "../../context";
import type { Db } from "../../db/client";
import { identities, notifications } from "../../db/schema";
import { countEvent } from "../funnel/steps";
import { type NotificationKind, notificationLink } from "./texts";

// Отправка уведомлений ботом (auto-tasks-pm-4 S10) — проход планировщика,
// после его транзакции: ответа Telegram не ждём под блокировками.
//
// Правила:
// - за проход — не больше BATCH сообщений и одно на человека (Bot API: до
//   30 в секунду всего и около одного в секунду в один чат);
// - 403 (бота заблокировали) или «чат не найден» — больше этому человеку
//   не шлём (identities.bot_blocked_at), его очередь закрыта;
// - 429 — ждём retry_after, попытка не считается;
// - сеть или 5xx — повтор через 1, 5, 30 минут и 2 часа, потом сдаёмся;
// - отправленные и брошенные записи живут 30 дней — потом удаляются.

export type OutgoingMessage = {
  // id аккаунта Telegram; у подставного транспорта без токена — может не быть.
  chatId: null | string;
  kind: NotificationKind;
  link: null | { label: string; url: string };
  text: string;
};

export type SendResult =
  | { error: string; ok: false; retryAfterMs?: number }
  | { logged?: true; ok: true }
  | { blocked: true; ok: false };

export type NotificationSender = {
  // telegram — настоящий Bot API; log — без TELEGRAM_BOT_TOKEN.
  mode: "log" | "telegram";
  send: (message: OutgoingMessage) => Promise<SendResult>;
};

const SEND_TIMEOUT_MS = 10_000;

// Без токена: сообщение — в лог сервера (без chat_id), запись — как
// отправленная. В воронку не идёт: никто ничего не получил.
export const createLogSender = (
  log: Pick<FastifyBaseLogger, "info">,
): NotificationSender => ({
  mode: "log",
  send: async (message) => {
    log.info(
      { kind: message.kind, text: message.text, url: message.link?.url },
      "Уведомление ботом (TELEGRAM_BOT_TOKEN не задан — только в лог)",
    );
    return { ok: true, logged: true };
  },
});

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

// Bot API sendMessage. Токен — только в адресе запроса: в ошибки и лог
// идут код ответа и метка, не адрес и не текст ответа.
export const createTelegramSender = ({
  apiUrl,
  fetchImpl = fetch,
  token,
}: {
  apiUrl: string;
  fetchImpl?: FetchLike;
  token: string;
}): NotificationSender => ({
  mode: "telegram",
  send: async (message) => {
    if (!message.chatId) return { ok: false, error: "no_chat" };
    let response: Response;
    try {
      response = await fetchImpl(`${apiUrl}/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          link_preview_options: { is_disabled: true },
          ...(message.link
            ? {
                reply_markup: {
                  inline_keyboard: [
                    [{ text: message.link.label, url: message.link.url }],
                  ],
                },
              }
            : {}),
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, error: "network" };
    }
    if (response.ok) return { ok: true };
    const body = (await response.json().catch(() => null)) as {
      description?: string;
      parameters?: { retry_after?: number };
    } | null;
    if (response.status === 403) return { ok: false, blocked: true };
    // Человек ни разу не открыл бота и не дал bot_access — писать нельзя.
    if (
      response.status === 400 &&
      /chat not found/i.test(body?.description ?? "")
    ) {
      return { ok: false, blocked: true };
    }
    if (response.status === 429) {
      const seconds = body?.parameters?.retry_after ?? 30;
      return {
        ok: false,
        error: "http_429",
        retryAfterMs: Math.max(1, seconds) * 1000,
      };
    }
    return { ok: false, error: `http_${response.status}` };
  },
});

export const BATCH = 25;
const MINUTE = 60_000;
const RETRY_DELAYS_MS = [1, 5, 30, 120].map((m) => m * MINUTE);
const KEEP_MS = 30 * 24 * 60 * MINUTE;

export type SendDeps = {
  // Адрес фронта для кнопки. Telegram принимает в кнопке только https.
  appUrl: string;
  clock: Clock;
  db: Db;
  log: FastifyBaseLogger;
  sender: NotificationSender;
};

export type SendReport = { failed: number; sent: number; skipped: number };

const linkFor = (kind: NotificationKind, refId: string, appUrl: string) =>
  appUrl.startsWith("https://") ? notificationLink(kind, refId, appUrl) : null;

export const sendDueNotifications = async ({
  appUrl,
  clock,
  db,
  log,
  sender,
}: SendDeps): Promise<SendReport> => {
  const { db: database } = db;
  const now = clock.now();
  const report: SendReport = { sent: 0, failed: 0, skipped: 0 };

  await database
    .delete(notifications)
    .where(lt(notifications.createdAt, new Date(now - KEEP_MS)));

  const due = await database
    .select({
      id: notifications.id,
      userId: notifications.userId,
      kind: notifications.kind,
      refId: notifications.refId,
      text: notifications.text,
      attempts: notifications.attempts,
      chatId: identities.chatId,
      botMessages: identities.botMessages,
      botBlockedAt: identities.botBlockedAt,
      provider: identities.provider,
    })
    .from(notifications)
    .leftJoin(
      identities,
      and(
        eq(identities.userId, notifications.userId),
        eq(identities.provider, "telegram"),
      ),
    )
    .where(
      and(
        isNotNull(notifications.nextAt),
        lte(notifications.nextAt, new Date(now)),
      ),
    )
    .orderBy(asc(notifications.nextAt), asc(notifications.id))
    .limit(BATCH * 4);

  const giveUp = (id: number, error: string) =>
    database
      .update(notifications)
      .set({ nextAt: null, error })
      .where(eq(notifications.id, id));

  const blockedUsers = new Set<string>();
  const thisPass = new Set<string>();
  let attempted = 0;
  for (const row of due) {
    if (attempted >= BATCH) break;
    // Одно сообщение на человека за проход — остальное в следующий.
    if (thisPass.has(row.userId)) continue;
    // Пока ставили в очередь, человек вышел из Telegram, выключил
    // переключатель или заблокировал бота — не шлём.
    const reason = !row.provider
      ? "no_identity"
      : row.botBlockedAt || blockedUsers.has(row.userId)
        ? "blocked"
        : !row.botMessages
          ? "disabled"
          : // Вошёл до S10: id аккаунта для chat_id ещё не знаем.
            sender.mode === "telegram" && !row.chatId
            ? "no_chat"
            : null;
    if (reason) {
      await giveUp(row.id, reason);
      report.skipped += 1;
      continue;
    }
    thisPass.add(row.userId);
    attempted += 1;
    const kind = row.kind as NotificationKind;
    const result = await sender
      .send({
        chatId: row.chatId,
        kind,
        text: row.text,
        link: linkFor(kind, row.refId, appUrl),
      })
      .catch((): SendResult => ({ ok: false, error: "sender" }));
    const at = new Date(clock.now());
    if (result.ok) {
      await database
        .update(notifications)
        .set({ sentAt: at, nextAt: null, error: null })
        .where(eq(notifications.id, row.id));
      report.sent += 1;
      if (!result.logged) {
        await database.transaction((tx) =>
          countEvent(tx, "notification_sent", now, row.userId),
        );
      }
      continue;
    }
    report.failed += 1;
    if ("blocked" in result) {
      blockedUsers.add(row.userId);
      await database
        .update(identities)
        .set({ botBlockedAt: at })
        .where(
          and(
            eq(identities.userId, row.userId),
            eq(identities.provider, "telegram"),
          ),
        );
      await database
        .update(notifications)
        .set({ nextAt: null, error: "blocked" })
        .where(
          and(
            eq(notifications.userId, row.userId),
            isNotNull(notifications.nextAt),
          ),
        );
      log.info({ kind }, "Бот: человек закрыл сообщения — больше не пишем");
      continue;
    }
    if (result.retryAfterMs !== undefined) {
      await database
        .update(notifications)
        .set({
          nextAt: new Date(at.getTime() + result.retryAfterMs),
          error: result.error,
        })
        .where(eq(notifications.id, row.id));
      continue;
    }
    const delay = RETRY_DELAYS_MS[row.attempts];
    await database
      .update(notifications)
      .set({
        attempts: row.attempts + 1,
        error: result.error,
        nextAt: delay === undefined ? null : new Date(at.getTime() + delay),
      })
      .where(eq(notifications.id, row.id));
    log.warn(
      { kind, error: result.error, attempt: row.attempts + 1 },
      "Бот: сообщение не ушло",
    );
  }
  return report;
};
