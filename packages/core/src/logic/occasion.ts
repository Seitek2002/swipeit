import { FIXED_OCCASION_DATES } from "../config/index";
import type { ImportantDate, User } from "../api/users/types";
import type { Occasion } from "../api/wishlist/types";
import { validation } from "../errors";
import { nextOccurrence } from "./dates";

// Повод вишлиста (TECH_SPEC §5 WishlistMeta.occasion, §6 PATCH
// /wishlist/meta, POST /wishlist/share). Правила без базы: на вход — даты
// владельца и его день рождения. Мок и сервер берут эти данные каждый по-своему.

// Повод из запроса владельца → то, что храним. Дату ставит сервер там, где
// она известна ему самому: значимая дата — ближайшее наступление своей
// даты, праздники с постоянной датой — их день, день рождения — из профиля.
// Лишнее отбрасываем: dateId — только у important, label — только у
// старого custom, preset берём из самой даты, а не из запроса.
export const normalizeOccasionFrom = (
  owner: { birthday?: User["birthday"]; dates: readonly ImportantDate[] },
  input: Occasion,
  now: number,
): Occasion => {
  switch (input.kind) {
    case "important": {
      const date = owner.dates.find((entry) => entry.id === input.dateId);
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
        (owner.birthday ? nextOccurrence(owner.birthday, now) : undefined);
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

// Повод ссылки-фильтра (auto-tasks U01): это праздник получателя, а не
// отправителя. Своих дат и дня рождения отправителя не подставляем: день
// рождения — только с датой из запроса (день рождения друга), значимая дата
// — только своя, в ссылке другу её нет. Ни названия, ни dateId наружу.
export const pickOccasionFrom = (input: Occasion, now: number): Occasion => {
  if (input.kind === "important") {
    throw validation("Значимая дата — только для своего вишлиста");
  }
  return (
    publicOccasion(normalizeOccasionFrom({ dates: [] }, input, now)) ?? {
      kind: "just_because",
    }
  );
};

// «День рождения, 3 декабря» друга — для шторки «Предложить выбрать».
export const birthdayOccasionOf = (
  birthday: string,
  now: number,
): Occasion => ({
  kind: "birthday",
  date: nextOccurrence(birthday, now),
});

// Повод значимой даты — по самой дате на момент чтения: прошло время — и
// ближайшее наступление уже другое; дату удалили — «Просто так».
export const freshOccasionFrom = (
  dates: readonly ImportantDate[],
  occasion: Occasion | undefined,
  now: number,
): Occasion | undefined => {
  if (occasion?.kind !== "important") return occasion;
  const date = dates.find((entry) => entry.id === occasion.dateId);
  if (!date) return { kind: "just_because" };
  return {
    kind: "important",
    dateId: date.id,
    // Переименованный готовый повод («Новоселье» → «Новоселье у моря») —
    // уже своё название: гостю не «на новоселье», а «к 5 декабря»
    // (auto-tasks P11, DESIGN §8.4: личное название в ссылку не попадает).
    ...(date.preset && !date.label ? { preset: date.preset } : {}),
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
export const occasionForOthersFrom = (
  dates: readonly ImportantDate[],
  occasion: Occasion | undefined,
  now: number,
): Occasion | undefined =>
  publicOccasion(freshOccasionFrom(dates, occasion, now));
