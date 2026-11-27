import { FIXED_OCCASION_DATES } from "@/shared/config";

import type { User } from "../users/types";
import type { Occasion } from "../wishlist/types";
import { nextOccurrence } from "./dates";
import type { Db } from "./db";
import { validation } from "./errors";

// Повод вишлиста на сервере (TECH_SPEC §5 WishlistMeta.occasion, §6
// PATCH /wishlist/meta, POST /wishlist/share).

// Повод из запроса владельца → то, что храним. Дату ставит сервер там, где
// она известна ему самому: значимая дата — ближайшее наступление своей
// даты, праздники с постоянной датой — их день, день рождения — из профиля.
// Лишнее отбрасываем: dateId — только у important, label — только у
// старого custom, preset берём из самой даты, а не из запроса.
export const normalizeOccasion = (
  db: Db,
  user: User,
  input: Occasion,
  now: number,
): Occasion => {
  switch (input.kind) {
    case "important": {
      const date = (db.importantDates[user.id] ?? []).find(
        (entry) => entry.id === input.dateId,
      );
      if (!date) throw validation("Такой даты нет — выбери её заново");
      return {
        kind: "important",
        dateId: date.id,
        ...(date.preset ? { preset: date.preset } : {}),
        date: nextOccurrence(date.date, now),
      };
    }
    case "march_8":
    case "new_year":
      return {
        kind: input.kind,
        date: nextOccurrence(FIXED_OCCASION_DATES[input.kind], now),
      };
    case "birthday": {
      const date =
        input.date ??
        (user.birthday ? nextOccurrence(user.birthday, now) : undefined);
      return { kind: "birthday", ...(date ? { date } : {}) };
    }
    case "just_because":
      return { kind: "just_because" };
    case "custom":
      return {
        kind: "custom",
        ...(input.label ? { label: input.label } : {}),
        ...(input.date ? { date: input.date } : {}),
      };
  }
};

// Повод значимой даты — по самой дате на момент чтения: прошло время — и
// ближайшее наступление уже другое; дату удалили — «Просто так».
export const freshOccasion = (
  db: Db,
  ownerId: string,
  occasion: Occasion | undefined,
  now: number,
): Occasion | undefined => {
  if (occasion?.kind !== "important") return occasion;
  const date = (db.importantDates[ownerId] ?? []).find(
    (entry) => entry.id === occasion.dateId,
  );
  if (!date) return { kind: "just_because" };
  return {
    kind: "important",
    dateId: date.id,
    ...(date.preset ? { preset: date.preset } : {}),
    date: nextOccurrence(date.date, now),
  };
};

// Повод глазами других (ссылка, профиль друга, Санта, ссылка-фильтр): у
// значимой даты — только дата и готовый повод, без dateId и своего
// названия: даты владельца личные (TECH_SPEC §6 «Личное»).
export const publicOccasion = (
  occasion: Occasion | undefined,
): Occasion | undefined => {
  if (!occasion) return undefined;
  const { kind, date, preset, label } = occasion;
  return {
    kind,
    ...(date ? { date } : {}),
    ...(kind === "important" && preset ? { preset } : {}),
    ...(kind === "custom" && label ? { label } : {}),
  };
};

// Чужой повод для показа: свежий и без личного.
export const occasionForOthers = (
  db: Db,
  ownerId: string,
  now: number,
): Occasion | undefined =>
  publicOccasion(
    freshOccasion(db, ownerId, db.wishlistMeta[ownerId]?.occasion, now),
  );
