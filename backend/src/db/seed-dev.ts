import { DEFAULT_WISHLIST_NAME } from "@swipeit/core/logic/wishlists";
import { inArray } from "drizzle-orm";

import { loadConfig } from "../config";
import { createDb } from "./client";
import * as schema from "./schema";

// npm run db:seed:dev — три человека с именами, вишлистами и дружбой для
// ручной проверки (BACKEND.md B03). Без ботов. Повторный запуск пересоздаёт
// их же: строки этих id удаляются и вставляются заново.
const PEOPLE = [
  {
    id: "u_seed_aigerim",
    name: "Айгерим",
    avatarColor: "rose",
    birthday: "03-14",
    wishes: ["p_0003", "p_0012", "p_0049", "p_0025", "p_0011"],
  },
  {
    id: "u_seed_azamat",
    name: "Азамат",
    avatarColor: "mint",
    birthday: "07-02",
    wishes: ["p_0016", "p_0021", "p_0037"],
  },
  {
    id: "u_seed_nurai",
    name: "Нурай",
    avatarColor: "champagne",
    birthday: "12-02",
    wishes: ["p_0047", "p_0089"],
  },
] as const;

const config = loadConfig();
const database = createDb(config.DATABASE_URL, 1);
const { db } = database;
const now = new Date();
const ids = PEOPLE.map((person) => person.id);

try {
  await db.transaction(async (tx) => {
    // Каскад уберёт желания, дружбу, повод и даты этих людей.
    await tx.delete(schema.users).where(inArray(schema.users.id, ids));
    await tx.insert(schema.users).values(
      PEOPLE.map((person) => ({
        id: person.id,
        name: person.name,
        avatarColor: person.avatarColor,
        birthday: person.birthday,
      })),
    );
    for (const person of PEOPLE) {
      // «Общий» — у каждого профиля (spec-multi-wishlists §3.3); повод — в
      // нём, а не в wishlist_meta.
      const wishlistId = `wl_seed_${person.id.slice(7)}`;
      await tx.insert(schema.wishlists).values({
        id: wishlistId,
        ownerId: person.id,
        name: DEFAULT_WISHLIST_NAME,
        isDefault: true,
        occasion: { kind: "birthday" },
      });
      await tx.insert(schema.wishlistItems).values(
        person.wishes.map((productId, index) => ({
          id: `wi_seed_${person.id.slice(7)}_${index}`,
          ownerId: person.id,
          sourceKind: "product",
          productId,
          sortOrder: index,
          wishlistId,
          addedAt: now,
        })),
      );
      await tx.insert(schema.wishlistMeta).values({
        ownerId: person.id,
        shareUnlockedAt: person.wishes.length >= 5 ? now : null,
      });
    }
    // Все трое — друзья друг другу, в обе стороны (§4.3).
    const pairs = ids.flatMap((a) =>
      ids.filter((b) => b !== a).map((b) => ({ userId: a, friendId: b })),
    );
    await tx
      .insert(schema.friendships)
      .values(pairs.map((pair) => ({ ...pair, source: "plan" })));
  });
  console.log(
    `Готово: ${PEOPLE.map((person) => person.name).join(", ")} — с вишлистами и дружбой`,
  );
} finally {
  await database.close();
}
