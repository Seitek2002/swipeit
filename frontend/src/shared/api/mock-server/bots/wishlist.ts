import type { User } from "../../users/types";
import type { GuestWishlist, ReservationsView } from "../../wishlist/types";
import { isApiError } from "../errors";
import type { BotApi, BotBehavior } from "./engine";

// Через 30–90 с после отправки вишлиста один-два бота-друга бронируют по
// подарку (TECH_SPEC §7). Владелец видит только счётчик, а строка «Азамат
// забронировал подарок» уходит в ленту демо-панели.
const DELAY_MS: [number, number] = [30_000, 90_000];

// Род — по «Показывать подарки» бота: «для неё» — значит, она.
const reservedVerb = (bot: User) =>
  bot.audience === "female"
    ? "забронировала"
    : bot.audience === "male"
      ? "забронировал"
      : "забронировал(а)";

// Одна попытка: свободный подарок или null, если брать нечего.
const tryReserve = async (api: BotApi, bot: User, ownerId: string) => {
  const wishlist = await api.as<GuestWishlist>(bot.id, {
    method: "GET",
    path: `/users/${encodeURIComponent(ownerId)}/wishlist`,
  });
  const view = await api.as<ReservationsView>(bot.id, {
    method: "GET",
    path: "/reservations",
    query: { ownerId },
  });
  if (view.role !== "guest") return null;
  // У бота уже есть бронь у этого друга — второй подарок он не берёт.
  if (view.items.some((item) => item.mine && !item.closed)) return null;
  const taken = new Set(
    view.items.filter((item) => !item.closed).map((item) => item.itemKey),
  );
  const free = wishlist.items.filter((item) => !taken.has(item.key));
  if (free.length === 0) return null;
  // «Очень хочу» — чаще.
  const top = free.filter((item) => item.priority === "top");
  const pool = top.length > 0 && api.random.next() < 0.6 ? top : free;
  const item = api.random.pick(pool);
  await api.as(bot.id, {
    method: "POST",
    path: "/reservations",
    body: { ownerId, itemKey: item.key, name: bot.name },
  });
  return wishlist.owner.name;
};

// Подарок мог забрать другой бот или человек между чтением и бронью —
// тогда берём другой (не больше трёх попыток).
const reserveOne = async (api: BotApi, bot: User, ownerId: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const ownerName = await tryReserve(api, bot, ownerId);
      if (ownerName) {
        api.report(
          bot.id,
          `${bot.name} ${reservedVerb(bot)} подарок у ${ownerName}`,
        );
      }
      return;
    } catch (error) {
      if (!isApiError(error) || error.code !== "CONFLICT") throw error;
    }
  }
};

export const wishlistBehavior: BotBehavior = {
  "wishlist:shared": async (api, event) => {
    const ownerId = event.id;
    const db = await api.db.read();
    const reserved = new Set(
      db.reservations
        .filter((entry) => entry.ownerId === ownerId && !entry.closedAt)
        .map((entry) => entry.reserver.userId),
    );
    const bots = (db.friends[ownerId] ?? [])
      .map((id) => db.users[id])
      .filter(
        (user): user is User =>
          Boolean(user?.isBot) && !reserved.has(user?.id ?? ""),
      );
    const chosen = api.random.shuffle(bots).slice(0, 1 + api.random.int(2));
    for (const bot of chosen) {
      api.schedule(bot, DELAY_MS, () => reserveOne(api, bot, ownerId));
    }
  },
};
