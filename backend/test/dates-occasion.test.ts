import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { wishlistMeta } from "../src/db/schema";
import { createTestDb, resetDb } from "./db";
import { createTestServer } from "./server";

// Повод вишлиста «Значимая дата» следует за датой (как в моке). Маршрута
// повода на сервере пока нет (B07) — повод ставим прямо в базе.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

const occasionOf = async (ownerId: string) => {
  const [meta] = await database.db
    .select()
    .from(wishlistMeta)
    .where(eq(wishlistMeta.ownerId, ownerId));
  return meta?.occasion;
};

describe("повод important и «Мои даты»", () => {
  it("смена даты двигает повод, удаление даты — повод «Просто так»", async () => {
    const me = await server.newUser();
    const own = (
      await server.request(me, "POST", "/me/dates", {
        date: "06-02",
        preset: "anniversary",
      })
    ).json() as { id: string };
    const other = (
      await server.request(me, "POST", "/me/dates", { date: "07-01" })
    ).json() as { id: string };
    await database.db
      .update(wishlistMeta)
      .set({
        occasion: {
          kind: "important",
          dateId: own.id,
          preset: "anniversary",
          date: "2027-06-02",
        },
      })
      .where(eq(wishlistMeta.ownerId, me.id));

    await server.request(me, "PATCH", `/me/dates/${own.id}`, {
      date: "06-10",
    });
    expect(await occasionOf(me.id)).toEqual({
      kind: "important",
      dateId: own.id,
      preset: "anniversary",
      date: "2027-06-10",
    });

    const untouched = await server.request(
      me,
      "DELETE",
      `/me/dates/${other.id}`,
    );
    expect(untouched.json().occasionReset).toBe(false);
    expect(await occasionOf(me.id)).toMatchObject({ dateId: own.id });

    const reset = await server.request(me, "DELETE", `/me/dates/${own.id}`);
    expect(reset.json().occasionReset).toBe(true);
    expect(await occasionOf(me.id)).toEqual({ kind: "just_because" });
  });
});
