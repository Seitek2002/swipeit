import { decompressFromEncodedURIComponent } from "lz-string";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { occasionLabel } from "@/shared/lib/format";
import { decodeWishlist, encodeEnvelope } from "@/shared/lib/share-codec";

import type {
  FriendSummary,
  ImportantDateView,
  MeResponse,
  Reminder,
  User,
} from "../users/types";
import type {
  GuestWishlist,
  WishlistMeta,
  WishlistResponse,
} from "../wishlist/types";
import {
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseProducts } from "./catalog-parse";
import type { SettingsAccess } from "./context";
import { createSeededRandom } from "./random";
import { DEMO_ANNIVERSARY_ID, DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Этап 7, T24 (сервер): «Мои даты», повод important и march_8, ссылка,
// напоминания и «Перемотать к напоминанию».
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

// 27.11.2026 12:00. Часы — как в бою: «сейчас» + смещение из настроек демо,
// чтобы перемотку было видно.
const BASE = new Date(2026, 10, 27, 12).getTime();

let server: MockServer;
let settings: SettingsAccess;
let realtime: ReturnType<typeof createRecordingRealtime>;

beforeEach(() => {
  settings = createMemorySettings();
  realtime = createRecordingRealtime();
  const clock = { now: () => BASE + settings.get().clockOffsetMs };
  server = createMockServer({
    catalog: createMemoryCatalog(products),
    clock,
    db: createMemoryDb(async () => createSeedDb({ products, now: BASE })),
    realtime,
    random: createSeededRandom("dates-test"),
    settings,
  });
});

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
) => server.handle({ method, path, userId, body }) as Promise<T>;

const newUser = async (name?: string) =>
  (await call<User>("POST", "/users", null, name ? { name } : undefined)).id;
const addDate = (userId: string, body: Record<string, unknown>) =>
  call<ImportantDateView>("POST", "/me/dates", userId, body);
const dates = (userId: string) =>
  call<ImportantDateView[]>("GET", "/me/dates", userId);
const setOccasion = (userId: string, occasion: unknown) =>
  call<WishlistMeta>("PATCH", "/wishlist/meta", userId, { occasion });
const reminders = (userId: string) =>
  call<Reminder[]>("GET", "/me/reminders", userId);

// Отправка открывается после 5 «Хочу», и нужно имя.
const readyToShare = async (name = "Айпери") => {
  const userId = await newUser(name);
  for (const product of products.slice(0, 5)) {
    await call("POST", "/swipes", userId, {
      productId: product.id,
      decision: "like",
      context: { kind: "self" },
    });
  }
  return userId;
};
const share = async (userId: string) => {
  const { url } = await call<{ url: string }>(
    "POST",
    "/wishlist/share",
    userId,
  );
  const encoded = url.slice("/w/?d=".length);
  return { encoded, decoded: decodeWishlist(encoded) };
};

describe("«Значимая дата N»", () => {
  it("«Пропустить» — наименьший свободный номер; дата с названием или поводом номер не занимает", async () => {
    const userId = await newUser();
    const first = await addDate(userId, { date: "06-02" });
    expect(first).toMatchObject({ autoNumber: 1, title: "Значимая дата 1" });
    const wedding = await addDate(userId, {
      date: "07-15",
      preset: "wedding",
    });
    expect(wedding.title).toBe("Свадьба");
    const own = await addDate(userId, {
      date: "08-01",
      label: "  Защита диплома ",
    });
    expect(own.title).toBe("Защита диплома");
    const second = await addDate(userId, { date: "09-01" });
    expect(second).toMatchObject({ autoNumber: 2, title: "Значимая дата 2" });

    await call("DELETE", `/me/dates/${first.id}`, userId);
    const again = await addDate(userId, { date: "10-01", label: "" });
    expect(again).toMatchObject({ autoNumber: 1, title: "Значимая дата 1" });
  });

  it("дубль даты не создаётся: та же дата — та же запись", async () => {
    const userId = await newUser();
    const created = await addDate(userId, { date: "06-02", preset: "wedding" });
    const same = await addDate(userId, { date: "06-02", label: "Другое" });
    expect(same.id).toBe(created.id);
    expect(same.title).toBe("Свадьба");
    expect(await dates(userId)).toHaveLength(1);
  });

  it("сортировка — по ближайшему наступлению", async () => {
    const userId = await newUser();
    await addDate(userId, { date: "06-02" });
    await addDate(userId, { date: "01-10" });
    await addDate(userId, { date: "12-05" });
    expect((await dates(userId)).map((d) => d.nextDate)).toEqual([
      "2026-12-05",
      "2027-01-10",
      "2027-06-02",
    ]);
  });

  it("переименовать; пустое название возвращает готовый повод или «Значимая дата N»", async () => {
    const userId = await newUser();
    const housewarming = await addDate(userId, {
      date: "06-02",
      preset: "housewarming",
    });
    const renamed = await call<ImportantDateView>(
      "PATCH",
      `/me/dates/${housewarming.id}`,
      userId,
      { label: "Новоселье у моря" },
    );
    expect(renamed.title).toBe("Новоселье у моря");
    const back = await call<ImportantDateView>(
      "PATCH",
      `/me/dates/${housewarming.id}`,
      userId,
      { label: "" },
    );
    expect(back.title).toBe("Новоселье");

    // Своё название снято, а «Значимая дата 1» уже занята — берём 2.
    const named = await addDate(userId, { date: "08-01", label: "Диплом" });
    await addDate(userId, { date: "09-01" });
    const unnamed = await call<ImportantDateView>(
      "PATCH",
      `/me/dates/${named.id}`,
      userId,
      { label: null },
    );
    expect(unnamed.title).toBe("Значимая дата 2");
  });

  it("сменить дату; на уже занятую — CONFLICT", async () => {
    const userId = await newUser();
    const a = await addDate(userId, { date: "06-02" });
    await addDate(userId, { date: "07-01" });
    const moved = await call<ImportantDateView>(
      "PATCH",
      `/me/dates/${a.id}`,
      userId,
      { date: "06-05" },
    );
    expect(moved.date).toBe("06-05");
    await expect(
      call("PATCH", `/me/dates/${a.id}`, userId, { date: "07-01" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      call("PATCH", `/me/dates/d_nope`, userId, { date: "07-02" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("неверная дата и слишком длинное название — VALIDATION", async () => {
    const userId = await newUser();
    await expect(addDate(userId, { date: "02-30" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      addDate(userId, { date: "02-01", label: "а".repeat(41) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("повод вишлиста", () => {
  it("important — только своя дата; дату ставит сервер", async () => {
    const userId = await newUser();
    const own = await addDate(userId, { date: "06-02", preset: "anniversary" });
    const meta = await setOccasion(userId, {
      kind: "important",
      dateId: own.id,
      date: "1999-01-01",
      label: "лишнее",
    });
    expect(meta.occasion).toEqual({
      kind: "important",
      dateId: own.id,
      preset: "anniversary",
      date: "2027-06-02",
    });
    await expect(
      setOccasion(userId, { kind: "important", dateId: DEMO_ANNIVERSARY_ID }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      setOccasion(userId, { kind: "important" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("8 Марта и Новый год — дату ставит сервер; день рождения — из профиля", async () => {
    const userId = await newUser();
    expect((await setOccasion(userId, { kind: "march_8" })).occasion).toEqual({
      kind: "march_8",
      date: "2027-03-08",
    });
    expect(
      (await setOccasion(userId, { kind: "new_year" })).occasion?.date,
    ).toBe("2026-12-31");
    await call("PATCH", "/me", userId, { birthday: "03-14" });
    expect((await setOccasion(userId, { kind: "birthday" })).occasion).toEqual({
      kind: "birthday",
      date: "2027-03-14",
    });
  });

  it("смена даты двигает повод, удаление даты — повод «Просто так»", async () => {
    const userId = await newUser();
    const own = await addDate(userId, { date: "06-02" });
    await setOccasion(userId, { kind: "important", dateId: own.id });
    await call("PATCH", `/me/dates/${own.id}`, userId, { date: "06-10" });
    const wishlist = () => call<WishlistResponse>("GET", "/wishlist", userId);
    expect((await wishlist()).meta.occasion?.date).toBe("2027-06-10");

    const deleted = await call<{ occasionReset: boolean }>(
      "DELETE",
      `/me/dates/${own.id}`,
      userId,
    );
    expect(deleted.occasionReset).toBe(true);
    expect((await wishlist()).meta.occasion).toEqual({ kind: "just_because" });
  });

  it("удаление другой даты повод не трогает; «Отменить» возвращает номер, если он свободен", async () => {
    const userId = await newUser();
    const kept = await addDate(userId, { date: "06-02" });
    const other = await addDate(userId, { date: "07-01" });
    await setOccasion(userId, { kind: "important", dateId: kept.id });
    const { date: removed } = await call<{ date: ImportantDateView }>(
      "DELETE",
      `/me/dates/${other.id}`,
      userId,
    );
    const meta = await call<WishlistResponse>("GET", "/wishlist", userId);
    expect(meta.meta.occasion?.dateId).toBe(kept.id);
    const restored = await addDate(userId, {
      date: removed.date,
      autoNumber: removed.autoNumber,
    });
    expect(restored.title).toBe("Значимая дата 2");
    // Номер успели занять — берём свободный.
    const third = await addDate(userId, { date: "08-01" });
    await call("DELETE", `/me/dates/${third.id}`, userId);
    await addDate(userId, { date: "09-01" });
    const late = await addDate(userId, { date: "08-01", autoNumber: 3 });
    expect(late.title).toBe("Значимая дата 4");
  });
});

describe("повод important в ссылке", () => {
  it("с готовым поводом — «на новоселье, 2 июня», без dateId и названия", async () => {
    const userId = await readyToShare();
    const own = await addDate(userId, {
      date: "06-02",
      preset: "housewarming",
    });
    await setOccasion(userId, { kind: "important", dateId: own.id });
    const { decoded, encoded } = await share(userId);
    expect(decoded?.occasion).toEqual({
      kind: "important",
      date: "2027-06-02",
      preset: "housewarming",
    });
    expect(occasionLabel(decoded?.occasion)).toBe("на новоселье, 2 июня");
    expect(decompressFromEncodedURIComponent(encoded)).not.toContain(own.id);
  });

  it("со своим названием — «к 2 июня», и названия в самой ссылке нет", async () => {
    const userId = await readyToShare();
    const own = await addDate(userId, {
      date: "06-02",
      label: "Защита диплома",
    });
    await setOccasion(userId, { kind: "important", dateId: own.id });
    const { decoded, encoded } = await share(userId);
    expect(decoded?.occasion).toEqual({
      kind: "important",
      date: "2027-06-02",
    });
    expect(occasionLabel(decoded?.occasion)).toBe("к 2 июня");
    const raw = decompressFromEncodedURIComponent(encoded) ?? "";
    expect(raw).not.toContain("Защита диплома");
    expect(raw).not.toContain(own.id);
  });

  it("«Значимая дата N» — тоже «к …», без названия", async () => {
    const userId = await readyToShare();
    const own = await addDate(userId, { date: "06-02" });
    await setOccasion(userId, { kind: "important", dateId: own.id });
    const { encoded, decoded } = await share(userId);
    expect(occasionLabel(decoded?.occasion)).toBe("к 2 июня");
    expect(decompressFromEncodedURIComponent(encoded)).not.toContain(
      "Значимая дата",
    );
  });

  it("8 Марта — «на 8 Марта»; день рождения — «на день рождения, 14 марта»", async () => {
    const userId = await readyToShare();
    await setOccasion(userId, { kind: "march_8" });
    expect(occasionLabel((await share(userId)).decoded?.occasion)).toBe(
      "на 8 Марта",
    );
    await call("PATCH", "/me", userId, { birthday: "03-14" });
    await setOccasion(userId, { kind: "birthday" });
    expect(occasionLabel((await share(userId)).decoded?.occasion)).toBe(
      "на день рождения, 14 марта",
    );
  });

  it("свой повод можно сломать подделкой ссылки, но название important гость не увидит", () => {
    // Подделанная ссылка с l у important: название отбрасывается.
    const forged = encodeEnvelope("wl", {
      o: { n: "Айпери", c: "mint" },
      oc: { k: "important", l: "Секрет", d: "2027-06-02" },
      i: [{ p: "p_0001" }],
    });
    expect(decodeWishlist(forged)?.occasion?.label).toBeUndefined();
  });

  it("старые ссылки с поводом custom читаются как раньше", () => {
    const old = encodeEnvelope("wl", {
      o: { n: "Айпери", c: "mint" },
      oc: { k: "custom", l: "Защита диплома", d: "2027-06-02" },
      i: [{ p: "p_0001" }],
    });
    const decoded = decodeWishlist(old);
    expect(decoded?.occasion).toMatchObject({
      kind: "custom",
      label: "Защита диплома",
    });
    expect(occasionLabel(decoded?.occasion)).toBe("Защита диплома, 2 июня");
  });
});

describe("личное — только владельцу", () => {
  it("свои даты и напоминания видит только сам; чужим — только повод", async () => {
    const owner = await newUser("Айпери");
    const other = await newUser("Бакыт");
    await call("PATCH", "/me", owner, { birthday: "12-10" });
    const own = await addDate(owner, { date: "06-02", label: "Секрет" });
    await setOccasion(owner, { kind: "important", dateId: own.id });
    const [reminder] = await reminders(owner);
    expect(reminder?.id).toBe("birthday:2026");
    await call(
      "POST",
      `/me/reminders/${encodeURIComponent(reminder?.id ?? "")}/dismiss`,
      owner,
    );

    expect(await dates(other)).toEqual([]);
    expect(await reminders(other)).toEqual([]);

    const seen = await call<User>("GET", `/users/${owner}`, other);
    expect(seen.dismissedReminders).toBeUndefined();
    expect(seen.seenHints).toBeUndefined();
    expect(seen.taste).toBeUndefined();
    const self = await call<User>("GET", `/users/${owner}`, owner);
    expect(self.dismissedReminders).toEqual(["birthday:2026"]);

    const guest = await call<GuestWishlist>(
      "GET",
      `/users/${owner}/wishlist`,
      other,
    );
    expect(guest.meta.occasion).toEqual({
      kind: "important",
      date: "2027-06-02",
    });
    const demoUsers = await call<User[]>("GET", "/demo/users", other);
    expect(
      demoUsers.find((user) => user.id === owner)?.dismissedReminders,
    ).toBeUndefined();
  });

  it("в друзьях — без личного, день рождения остаётся", async () => {
    const friends = await call<FriendSummary[]>(
      "GET",
      "/friends",
      await newUser(),
    );
    const aigerim = friends.find((f) => f.user.id === DEMO_USER_ID)?.user;
    expect(aigerim?.birthday).toBe("03-14");
    expect(aigerim?.taste).toBeUndefined();
  });
});

describe("напоминания", () => {
  it("«Перемотать к напоминанию» без своих дат — VALIDATION", async () => {
    const userId = await newUser();
    await expect(
      call("POST", "/demo/clock/to-reminder", userId),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Сначала отправь вишлист с датой",
    });
  });

  it("перемотка → «Через 30 дней»; «Скрыть» → нет до следующего года; ещё перемотка → следующее нескрытое", async () => {
    const userId = await newUser();
    await call("PATCH", "/me", userId, { birthday: "03-14" });
    const own = await addDate(userId, { date: "06-02", preset: "anniversary" });
    expect(await reminders(userId)).toEqual([]);

    const jump = await call<{ reminder: Reminder }>(
      "POST",
      "/demo/clock/to-reminder",
      userId,
    );
    expect(jump.reminder).toMatchObject({
      id: "birthday:2027",
      daysLeft: 30,
      label: "твой день рождения",
    });
    expect(await reminders(userId)).toEqual([jump.reminder]);
    expect(realtime.events.at(-1)).toMatchObject({
      type: "db:changed",
      scope: ["settings", "users"],
    });

    const after = await call<Reminder[]>(
      "POST",
      `/me/reminders/${encodeURIComponent("birthday:2027")}/dismiss`,
      userId,
    );
    expect(after).toEqual([]);
    // «После перезагрузки» — тот же ответ: скрытие лежит в профиле.
    expect(await reminders(userId)).toEqual([]);

    const next = await call<{ reminder: Reminder }>(
      "POST",
      "/demo/clock/to-reminder",
      userId,
    );
    expect(next.reminder).toMatchObject({
      id: `${own.id}:2027`,
      kind: "important",
      label: "Годовщина",
      daysLeft: 30,
    });
    await call(
      "POST",
      `/me/reminders/${encodeURIComponent(`${own.id}:2027`)}/dismiss`,
      userId,
    );
    // Обе даты этого года скрыты — та же дата через год.
    const nextYear = await call<{ reminder: Reminder }>(
      "POST",
      "/demo/clock/to-reminder",
      userId,
    );
    expect(nextYear.reminder.id).toBe("birthday:2028");
  });

  it("неверный id напоминания — VALIDATION", async () => {
    const userId = await newUser();
    await expect(
      call("POST", "/me/reminders/nope/dismiss", userId),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("день рождения в профиле", () => {
  it("PATCH /me { birthday } ставит и снимает дату", async () => {
    const userId = await newUser();
    const set = await call<MeResponse>("PATCH", "/me", userId, {
      birthday: "03-14",
    });
    expect(set.birthday).toBe("03-14");
    const cleared = await call<MeResponse>("PATCH", "/me", userId, {
      birthday: null,
    });
    expect(cleared.birthday).toBeUndefined();
    await expect(
      call("PATCH", "/me", userId, { birthday: "13-01" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("сид", () => {
  it("у Айгерим — день рождения и «Годовщина, 2 июня»", async () => {
    await call("POST", "/auth/demo", null);
    const me = await call<MeResponse>("GET", "/me", DEMO_USER_ID);
    expect(me.birthday).toBe("03-14");
    expect(await dates(DEMO_USER_ID)).toEqual([
      expect.objectContaining({
        id: DEMO_ANNIVERSARY_ID,
        date: "06-02",
        preset: "anniversary",
        title: "Годовщина",
      }),
    ]);
  });
});
