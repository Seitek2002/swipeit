import type { ExternalWishlist, OpenedWishlist } from "../api/wishlist/types";

// «Открывал по ссылке» на «Друзьях» (UX-аудит X03): гость собрал свой
// вишлист, а вишлист друга можно было найти только в чате. Общая для мока и
// сервера.

// Снимок и когда его открыл именно этот человек (а не кто-то ещё на том же
// ноутбуке в «Локальной сети»).
export type OpenedSnapshot = {
  openedAt: string;
  snapshot: ExternalWishlist;
};

// Владелец снимка: id профиля из ссылки, у очень старых ссылок — id снимка.
export const snapshotOwnerKey = (snapshot: ExternalWishlist) =>
  snapshot.owner.userId ?? snapshot.id;

// По одному вишлисту на владельца — последний открытый: та же ссылка
// пришла дважды или друг прислал новую к другому поводу. Свой вишлист
// («как друзья») и друзей из списка не показываем: у друзей есть профиль.
// Без пути снимок открыть нечем — его тоже нет.
export const openedWishlists = (
  entries: readonly OpenedSnapshot[],
  { friendIds, meId }: { friendIds: ReadonlySet<string>; meId?: string },
): OpenedWishlist[] => {
  const latest = new Map<string, OpenedSnapshot & { url: string }>();
  for (const entry of entries) {
    const { snapshot } = entry;
    const url = snapshot.link;
    if (!url) continue;
    const userId = snapshot.owner.userId;
    if (userId && (userId === meId || friendIds.has(userId))) continue;
    const key = snapshotOwnerKey(snapshot);
    const current = latest.get(key);
    if (!current || current.openedAt < entry.openedAt) {
      latest.set(key, { ...entry, url });
    }
  }
  return [...latest.values()]
    .sort((a, b) => b.openedAt.localeCompare(a.openedAt))
    .map(({ snapshot, openedAt, url }) => ({
      id: snapshot.id,
      owner: {
        name: snapshot.owner.name,
        avatarColor: snapshot.owner.avatarColor,
        ...(snapshot.owner.userId ? { userId: snapshot.owner.userId } : {}),
      },
      ...(snapshot.meta.occasion ? { occasion: snapshot.meta.occasion } : {}),
      openedAt,
      url,
    }));
};

// Снимок для строки «Я дарю» (X03): из тех, что человек открывал, — где есть
// это желание, самый свежий. Нет открытых им — любой снимок этого владельца
// с желанием (бронь старше X03, когда кто открыл, не записывали).
export const snapshotForReservation = (
  snapshots: readonly ExternalWishlist[],
  {
    itemKey,
    openedAt,
    ownerId,
  }: {
    itemKey: string;
    // id снимка → когда его открыл этот человек.
    openedAt: Readonly<Record<string, string>>;
    ownerId: string;
  },
): ExternalWishlist | undefined => {
  const candidates = snapshots.filter(
    (snapshot) =>
      (snapshot.id === ownerId || snapshot.owner.userId === ownerId) &&
      snapshot.items.some((item) => item.key === itemKey),
  );
  const mine = candidates.filter((snapshot) => openedAt[snapshot.id]);
  const pool = mine.length > 0 ? mine : candidates;
  const when = (snapshot: ExternalWishlist) =>
    openedAt[snapshot.id] ?? snapshot.openedAt;
  return pool.reduce<ExternalWishlist | undefined>(
    (best, snapshot) =>
      !best || when(best) < when(snapshot) ? snapshot : best,
    undefined,
  );
};
