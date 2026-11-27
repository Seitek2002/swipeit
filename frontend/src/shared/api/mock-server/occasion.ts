// Повод вишлиста в моке: обёртка над Db вокруг правил @swipeit/core
// (BACKEND.md B02): правило берёт даты владельца, а не базу целиком.
import {
  freshOccasionFrom,
  normalizeOccasionFrom,
  occasionForOthersFrom,
  publicOccasion,
} from "@swipeit/core/logic/occasion";

import type { User } from "../users/types";
import type { Occasion } from "../wishlist/types";
import type { Db } from "./db";

export { publicOccasion };

export const normalizeOccasion = (
  db: Db,
  user: User,
  input: Occasion,
  now: number,
): Occasion =>
  normalizeOccasionFrom(
    { birthday: user.birthday, dates: db.importantDates[user.id] ?? [] },
    input,
    now,
  );

export const freshOccasion = (
  db: Db,
  ownerId: string,
  occasion: Occasion | undefined,
  now: number,
): Occasion | undefined =>
  freshOccasionFrom(db.importantDates[ownerId] ?? [], occasion, now);

export const occasionForOthers = (
  db: Db,
  ownerId: string,
  now: number,
): Occasion | undefined =>
  occasionForOthersFrom(
    db.importantDates[ownerId] ?? [],
    db.wishlistMeta[ownerId]?.occasion,
    now,
  );
