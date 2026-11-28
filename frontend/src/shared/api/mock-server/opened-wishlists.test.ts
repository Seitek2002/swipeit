import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { encodeWishlist } from "@/shared/lib/share-codec";

import type { User } from "../users/types";
import type {
  ExternalWishlist,
  GuestWishlist,
  MyReservation,
  OpenedWishlist,
} from "../wishlist/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseProducts } from "./catalog-parse";
import { createSeededRandom } from "./random";
import { createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// UX-аудит X03: гость собрал свой вишлист — вишлист друга по ссылке он
// находит в «Я дарю» и в «Открывал по ссылке».
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

const NOW = new Date(2026, 10, 28, 12).getTime();
// Тимур с другого телефона: его профиля в этой базе нет, а демо-друг
// «Тимур» (u_timur) — другой человек.
const TIMUR_PHONE_ID = "u_timurphone";
const GUEST_ID = "g_guestphone";

let server: MockServer;
let clock: ReturnType<typeof createFixedClock>;

const call = <T>(
  method: "DELETE" | "GET" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const productId = () => {
  const id = products[0]?.id;
  if (!id) throw new Error("пустой каталог-заглушка");
  return id;
};

const timurLink = (occasionDate = "2026-12-31") =>
  encodeWishlist({
    owner: { name: "Тимур", avatarColor: "mint", userId: TIMUR_PHONE_ID },
    occasion: { kind: "new_year", date: occasionDate },
    items: [{ productId: productId(), priority: "normal" }],
  });

const open = (encoded: string, userId: null | string, guestId?: string) =>
  call<ExternalWishlist>("POST", "/external-wishlists", userId, {
    encoded,
    guestId,
  });

const myReservations = (userId: string) =>
  call<MyReservation[]>("GET", "/me/reservations", userId);

const opened = (userId: string) =>
  call<OpenedWishlist[]>("GET", "/me/opened-wishlists", userId);

const newUser = (guestId?: string) =>
  call<User>("POST", "/users", null, { name: "Гость", guestId });

beforeEach(() => {
  clock = createFixedClock(NOW);
  server = createMockServer({
    catalog: createMemoryCatalog(products),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    realtime: createRecordingRealtime(),
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("путь обратно к вишлисту по ссылке (X03)", () => {
  it("снимок знает свою ссылку", async () => {
    const encoded = timurLink();
    expect((await open(encoded, null, GUEST_ID)).link).toBe(`/w/?d=${encoded}`);
  });

  it("гость бронирует, собирает свой вишлист — «Я дарю» ведёт на ссылку", async () => {
    const encoded = timurLink();
    await open(encoded, null, GUEST_ID);
    await call("POST", "/reservations", null, {
      ownerId: TIMUR_PHONE_ID,
      itemKey: productId(),
      name: "Бакыт",
      guestId: GUEST_ID,
    });
    const profile = await newUser(GUEST_ID);

    expect(await myReservations(profile.id)).toEqual([
      expect.objectContaining({
        owner: expect.objectContaining({ id: TIMUR_PHONE_ID, name: "Тимур" }),
        byLink: true,
        wishlistUrl: `/w/?d=${encoded}`,
      }),
    ]);
    expect(await opened(profile.id)).toEqual([
      expect.objectContaining({
        owner: expect.objectContaining({
          name: "Тимур",
          userId: TIMUR_PHONE_ID,
        }),
        occasion: { kind: "new_year", date: "2026-12-31" },
        url: `/w/?d=${encoded}`,
      }),
    ]);
  });

  it("две ссылки Тимура — одна строка, последняя; бронь — на ту, где желание", async () => {
    const user = await newUser();
    const newYear = timurLink();
    await open(newYear, user.id);
    await call("POST", "/reservations", user.id, {
      ownerId: TIMUR_PHONE_ID,
      itemKey: productId(),
    });
    clock.advance(60_000);
    const withoutItem = encodeWishlist({
      owner: { name: "Тимур", avatarColor: "mint", userId: TIMUR_PHONE_ID },
      items: [{ custom: { title: "Плед" }, priority: "normal" }],
    });
    await open(withoutItem, user.id);

    expect((await opened(user.id)).map((item) => item.url)).toEqual([
      `/w/?d=${withoutItem}`,
    ]);
    expect((await myReservations(user.id))[0]?.wishlistUrl).toBe(
      `/w/?d=${newYear}`,
    );
  });

  it("демо-друг из списка — без «по ссылке», ведёт в профиль", async () => {
    const user = await newUser();
    const friendWishlist = await call<GuestWishlist>(
      "GET",
      "/users/u_azamat/wishlist",
      user.id,
    );
    const key = friendWishlist.items[0]?.key;
    if (!key) throw new Error("у Азамата нет желаний");
    await call("POST", "/reservations", user.id, {
      ownerId: "u_azamat",
      itemKey: key,
    });
    const [row] = await myReservations(user.id);
    expect(row?.owner.id).toBe("u_azamat");
    expect(row).not.toHaveProperty("byLink");
    expect(row).not.toHaveProperty("wishlistUrl");
    expect(await opened(user.id)).toEqual([]);
  });

  it("«Открывал по ссылке» у каждого свой: в «Локальной сети» база общая", async () => {
    const first = await newUser();
    const second = await newUser();
    await open(timurLink(), first.id);
    expect(await opened(first.id)).toHaveLength(1);
    expect(await opened(second.id)).toEqual([]);
  });

  it("свой вишлист по своей ссылке в «Открывал по ссылке» не попадает", async () => {
    const user = await newUser();
    const own = encodeWishlist({
      owner: { name: "Гость", avatarColor: "mint", userId: user.id },
      items: [{ productId: productId(), priority: "normal" }],
    });
    await open(own, user.id);
    expect(await opened(user.id)).toEqual([]);
  });

  it("без профиля «Открывал по ссылке» не отдаётся", async () => {
    await expect(
      call("GET", "/me/opened-wishlists", null),
    ).rejects.toMatchObject({ code: expect.any(String) });
  });
});
