import { and, eq, inArray, isNull } from "drizzle-orm";

import type { Tx } from "../../context";
import { identities, notifications } from "../../db/schema";
import type { NotificationKind } from "./texts";

// Очередь уведомлений ботом (auto-tasks-pm-4 S10). Ставим в той же
// транзакции, что и событие: откатилось событие — откатилось и уведомление.
// Отправляет планировщик (sender.ts).

const PROVIDER = "telegram";

// Кому бот может писать: вошёл через Telegram, не выключил «Сообщения от
// бота» и не заблокировал бота. Остальным — ничего.
export const botRecipients = async (
  tx: Tx,
  userIds: readonly string[],
): Promise<string[]> => {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await tx
    .select({ userId: identities.userId })
    .from(identities)
    .where(
      and(
        inArray(identities.userId, ids),
        eq(identities.provider, PROVIDER),
        eq(identities.botMessages, true),
        isNull(identities.botBlockedAt),
      ),
    );
  return [...new Set(rows.map((row) => row.userId))];
};

export type NotificationDraft = {
  kind: NotificationKind;
  // Игра или план — для кнопки.
  refId: string;
  text: string;
  // Одна запись на событие и человека: повтор с тем же ключом не встанет.
  // В ключе — только id адресата, игры или плана и метка события; id других
  // людей сюда не идут (иначе по очереди читались бы пары).
  dedupeKey: (userId: string) => string;
  userIds: readonly string[];
};

export const enqueueNotifications = async (
  tx: Tx,
  draft: NotificationDraft,
  now: number,
): Promise<number> => {
  const recipients = await botRecipients(tx, draft.userIds);
  if (recipients.length === 0) return 0;
  const at = new Date(now);
  const inserted = await tx
    .insert(notifications)
    .values(
      recipients.map((userId) => ({
        userId,
        kind: draft.kind,
        refId: draft.refId,
        dedupeKey: draft.dedupeKey(userId),
        text: draft.text,
        createdAt: at,
        nextAt: at,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: notifications.id });
  return inserted.length;
};
