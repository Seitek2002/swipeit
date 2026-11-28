import type { GuestWishlist } from "@swipeit/core/api/wishlist/types";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { asc, eq, sql } from "drizzle-orm";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { createSession } from "../src/auth/sessions";
import { createDb, type Db } from "../src/db/client";
import { MIGRATIONS_DIR, runMigrations } from "../src/db/migrate";
import * as schema from "../src/db/schema";
import { testConfig } from "./config";
import { NOW, testCatalog } from "./contract/client";
import { testDatabaseUrl } from "./db";

// Миграция 0015 (spec-multi-wishlists §3.3, L03) на копии данных: база в
// состоянии 0014 с желаниями, поводом в wishlist_meta и живой ссылкой
// «u_…» → 0015 → у каждого профиля один «Общий» с поводом и сообщением, все
// желания в нём, старая ссылка открывает «Общий». Своя база рядом с
// тестовой: общую тестовую базу global-setup уже домигрировал.

const LAST_BEFORE = 14; // 0014_draw_snapshot_active_day

const databaseUrl = (suffix: string) => {
  const url = new URL(testDatabaseUrl());
  url.pathname = `${url.pathname}_${suffix}`;
  return url;
};

const recreateDatabase = async (url: URL) => {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const name = url.pathname.slice(1);
    await client.query(`drop database if exists "${name}" with (force)`);
    await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
};

// Папка миграций до 0014 включительно: те же файлы и журнал без 0015.
const migrationsUpTo = async (last: number): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "swipeit-mig-"));
  await mkdir(path.join(dir, "meta"));
  const journal = JSON.parse(
    await readFile(path.join(MIGRATIONS_DIR, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };
  journal.entries = journal.entries.filter((entry) => entry.idx <= last);
  await writeFile(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify(journal),
  );
  for (const entry of journal.entries) {
    await copyFile(
      path.join(MIGRATIONS_DIR, `${entry.tag}.sql`),
      path.join(dir, `${entry.tag}.sql`),
    );
  }
  return dir;
};

const at = new Date(NOW - 3600_000);

// Создать и удалить базу под нагрузкой полного прогона — секунды, а не
// миллисекунды: свой запас времени на хуки и тест пустой базы.
const DB_TIMEOUT_MS = 120_000;

const dropDatabase = async (url: URL) => {
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(
      `drop database if exists "${url.pathname.slice(1)}" with (force)`,
    );
  } finally {
    await client.end();
  }
};

describe("миграция 0015: несколько вишлистов на старых данных", () => {
  const url = databaseUrl("mig");
  let database: Db;
  let oldMigrations: string;

  beforeAll(async () => {
    await recreateDatabase(url);
    database = createDb(url.toString(), 2);
    oldMigrations = await migrationsUpTo(LAST_BEFORE);
    await runMigrations(database.db, oldMigrations);

    // Состояние 0014 — сырыми запросами: схема Drizzle уже новая.
    await database.pool.query(`
      insert into users (id, name, avatar_color, created_at) values
        ('u_dana', 'Дана', 'rose', now() - interval '30 days'),
        ('u_empty', null, 'mint', now() - interval '1 day');
      insert into wishlist_meta
        (owner_id, occasion, message, hide_reservation_count,
         share_unlocked_at, dismissed_given_hint_for)
      values ('u_dana', '{"kind":"birthday","date":"2027-03-14"}',
        'Буду рада', true, now(), '2026-03-14');
      insert into wishlist_items
        (id, owner_id, source_kind, product_id, custom, priority, sort_order,
         status, added_at, deleted_at)
      values
        ('wi_1', 'u_dana', 'product', 'p_0001', null, 'top', 0, 'active',
          now(), null),
        ('wi_2', 'u_dana', 'product', 'p_0002', null, 'normal', 1, 'active',
          now(), null),
        ('wi_3', 'u_dana', 'custom', null, '{"title":"Книга"}', 'normal', 2,
          'active', now(), null),
        ('wi_4', 'u_dana', 'product', 'p_0004', null, 'normal', 3, 'given',
          now(), null),
        ('wi_5', 'u_dana', 'product', 'p_0005', null, 'normal', 4, 'active',
          now(), now());
      insert into share_links (code, kind, owner_id, target_id)
      values ('DanaLink01', 'wishlist', 'u_dana', 'u_dana');
    `);

    await runMigrations(database.db);
  }, DB_TIMEOUT_MS);

  afterAll(async () => {
    await database?.close();
    await dropDatabase(url);
    if (oldMigrations)
      await rm(oldMigrations, { recursive: true, force: true });
  }, DB_TIMEOUT_MS);

  it("у каждого профиля ровно один «Общий»; повод, сообщение и подсказка — из wishlist_meta", async () => {
    const lists = await database.db
      .select()
      .from(schema.wishlists)
      .orderBy(asc(schema.wishlists.ownerId));
    expect(
      lists.map((list) => ({
        ownerId: list.ownerId,
        name: list.name,
        isDefault: list.isDefault,
        occasion: list.occasion,
        message: list.message,
        dismissedGivenHintFor: list.dismissedGivenHintFor,
      })),
    ).toEqual([
      {
        ownerId: "u_dana",
        name: "Общий",
        isDefault: true,
        occasion: { kind: "birthday", date: "2027-03-14" },
        message: "Буду рада",
        dismissedGivenHintFor: "2026-03-14",
      },
      {
        ownerId: "u_empty",
        name: "Общий",
        isDefault: true,
        occasion: null,
        message: null,
        dismissedGivenHintFor: null,
      },
    ]);
    for (const list of lists) expect(list.id).toMatch(/^wl_[0-9a-f]{10}$/);
  });

  it("все желания — в «Общем»: активные, подаренные и удалённые в окне «Отменить»; остальное в строках не тронуто", async () => {
    const [dana] = await database.db
      .select()
      .from(schema.wishlists)
      .where(eq(schema.wishlists.ownerId, "u_dana"));
    const items = await database.db
      .select()
      .from(schema.wishlistItems)
      .orderBy(asc(schema.wishlistItems.sortOrder));
    expect(items.map((item) => [item.id, item.wishlistId])).toEqual(
      ["wi_1", "wi_2", "wi_3", "wi_4", "wi_5"].map((id) => [id, dana?.id]),
    );
    expect(items.map((item) => item.originId)).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(items[0]).toMatchObject({ priority: "top", status: "active" });
    expect(items[3]).toMatchObject({ status: "given" });
    // Главный, Санта и порог — у человека, как были.
    const [user] = await database.db
      .select({ active: schema.users.activeWishlistId })
      .from(schema.users)
      .where(eq(schema.users.id, "u_dana"));
    expect(user?.active).toBeNull();
    const [meta] = await database.db
      .select()
      .from(schema.wishlistMeta)
      .where(eq(schema.wishlistMeta.ownerId, "u_dana"));
    expect(meta?.hideReservationCount).toBe(true);
    expect(meta?.shareUnlockedAt).toBeInstanceOf(Date);
  });

  it("уникальный индекс заменён: один товар — одно живое желание в вишлисте", async () => {
    const { rows } = await database.pool.query<{ indexname: string }>(
      "select indexname from pg_indexes where tablename = 'wishlist_items' order by indexname",
    );
    const names = rows.map((row) => row.indexname);
    expect(names).not.toContain("wishlist_items_owner_product_active");
    expect(names).toContain("wishlist_items_list_product_active");
    expect(names).toContain("wishlist_items_list_status_order");
  });

  it("ссылки не тронуты; старая ссылка «u_…» открывает «Общий», повторная отправка даёт тот же код", async () => {
    const [link] = await database.db
      .select()
      .from(schema.shareLinks)
      .where(eq(schema.shareLinks.code, "DanaLink01"));
    expect(link).toMatchObject({ targetId: "u_dana", revokedAt: null });

    const app = buildApp({
      config: testConfig(),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
      random: createSeededRandom("migration"),
    });
    try {
      const guest = await app.inject({
        method: "GET",
        url: "/v1/share/DanaLink01",
      });
      expect(guest.statusCode).toBe(200);
      const body = guest.json() as {
        kind: string;
        ownerId: string;
        wishlist: GuestWishlist;
      };
      expect(body).toMatchObject({ kind: "wishlist", ownerId: "u_dana" });
      // Только активные и не удалённые, «Очень хочу» сверху.
      expect(body.wishlist.items.map((item) => item.key)).toEqual([
        "p_0001",
        "p_0002",
        "custom:wi_3",
      ]);
      expect(body.wishlist.meta.message).toBe("Буду рада");
      expect(body.wishlist.meta.occasion).toMatchObject({ kind: "birthday" });

      // Владелец отправляет снова — тот же код (ensureWishlistLink).
      const { token } = await database.db.transaction((tx) =>
        createSession(tx, "u_dana", { now: () => NOW }, null),
      );
      const again = await app.inject({
        method: "POST",
        url: "/v1/wishlist/share",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(again.statusCode).toBe(200);
      expect((again.json() as { code: string }).code).toBe("DanaLink01");

      // Свой вишлист — «Общий» с перенесённым поводом.
      const mine = await app.inject({
        method: "GET",
        url: "/v1/wishlist",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(mine.json()).toMatchObject({
        meta: {
          occasion: { kind: "birthday" },
          message: "Буду рада",
          hideReservationCount: true,
        },
        wishlist: { name: "Общий", isDefault: true },
      });
      expect((mine.json() as { items: unknown[] }).items).toHaveLength(4);
    } finally {
      await app.close();
    }
  });

  it("после 0015: повтор товара в одном вишлисте — нарушение нового индекса", async () => {
    const [list] = await database.db
      .select()
      .from(schema.wishlists)
      .where(eq(schema.wishlists.ownerId, "u_empty"));
    const twin = database.db.insert(schema.wishlistItems).values([
      {
        id: "wi_a",
        ownerId: "u_empty",
        sourceKind: "product",
        productId: "p_0010",
        sortOrder: 0,
        wishlistId: list?.id ?? null,
        addedAt: at,
      },
      {
        id: "wi_b",
        ownerId: "u_empty",
        sourceKind: "product",
        productId: "p_0010",
        sortOrder: 0,
        wishlistId: list?.id ?? null,
        addedAt: at,
      },
    ]);
    await expect(twin).rejects.toThrow();
  });
});

describe("миграция 0015 на пустой базе", () => {
  it(
    "проходит: таблица wishlists пустая, повторный запуск ничего не меняет",
    async () => {
      const url = databaseUrl("mig_empty");
      await recreateDatabase(url);
      const database = createDb(url.toString(), 1);
      try {
        await runMigrations(database.db);
        await runMigrations(database.db);
        const { rows } = await database.db.execute<{ n: number }>(
          sql`select count(*)::int as n from wishlists`,
        );
        expect(rows[0]?.n).toBe(0);
      } finally {
        await database.close();
        await dropDatabase(url);
      }
    },
    DB_TIMEOUT_MS,
  );
});
