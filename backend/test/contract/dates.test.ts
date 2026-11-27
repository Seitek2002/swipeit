import type {
  ImportantDateView,
  Reminder,
} from "@swipeit/core/api/users/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS } from "./client";

// Контрактный тест «Моих дат» и напоминаний (BACKEND.md B05) — по
// important-dates.test.ts мока. Часы стоят: 28.11.2026, полдень.
describe.each(CLIENTS)("даты и напоминания — %s", (_name, create) => {
  let api: ApiClient;
  let me: Caller;
  beforeEach(async () => {
    api = await create();
    ({ caller: me } = await api.newUser());
  });
  afterEach(() => api.close());

  const addDate = (body: Record<string, unknown>, caller = me) =>
    api.call<ImportantDateView>(caller, "POST", "/me/dates", body);
  const dates = (caller = me) =>
    api.call<ImportantDateView[]>(caller, "GET", "/me/dates");
  const patchDate = (id: string, body: Record<string, unknown>) =>
    api.call<ImportantDateView>(me, "PATCH", `/me/dates/${id}`, body);
  const deleteDate = (id: string) =>
    api.call<{ date: ImportantDateView; occasionReset: boolean }>(
      me,
      "DELETE",
      `/me/dates/${id}`,
    );
  const reminders = (caller = me) =>
    api.call<Reminder[]>(caller, "GET", "/me/reminders");
  const dismiss = (id: string) =>
    api.call<Reminder[]>(
      me,
      "POST",
      `/me/reminders/${encodeURIComponent(id)}/dismiss`,
    );

  it("«Значимая дата N» — наименьший свободный номер; с названием или поводом номер не занимает", async () => {
    const first = await addDate({ date: "06-02" });
    expect(first).toMatchObject({ autoNumber: 1, title: "Значимая дата 1" });
    expect((await addDate({ date: "07-15", preset: "wedding" })).title).toBe(
      "Свадьба",
    );
    expect(
      (await addDate({ date: "08-01", label: "  Защита диплома " })).title,
    ).toBe("Защита диплома");
    expect(await addDate({ date: "09-01" })).toMatchObject({
      autoNumber: 2,
      title: "Значимая дата 2",
    });
    await deleteDate(first.id);
    expect(await addDate({ date: "10-01", label: "" })).toMatchObject({
      autoNumber: 1,
      title: "Значимая дата 1",
    });
  });

  it("дубль даты не создаётся; сортировка — по ближайшему наступлению", async () => {
    const created = await addDate({ date: "06-02", preset: "wedding" });
    const same = await addDate({ date: "06-02", label: "Другое" });
    expect(same.id).toBe(created.id);
    expect(same.title).toBe("Свадьба");
    await addDate({ date: "01-10" });
    await addDate({ date: "12-05" });
    expect((await dates()).map((date) => date.nextDate)).toEqual([
      "2026-12-05",
      "2027-01-10",
      "2027-06-02",
    ]);
  });

  it("переименовать; пустое название возвращает готовый повод или «Значимая дата N»", async () => {
    const housewarming = await addDate({
      date: "06-02",
      preset: "housewarming",
    });
    expect(
      (await patchDate(housewarming.id, { label: "Новоселье у моря" })).title,
    ).toBe("Новоселье у моря");
    expect((await patchDate(housewarming.id, { label: "" })).title).toBe(
      "Новоселье",
    );
    const named = await addDate({ date: "08-01", label: "Диплом" });
    await addDate({ date: "09-01" });
    expect((await patchDate(named.id, { label: null })).title).toBe(
      "Значимая дата 2",
    );
  });

  it("сменить дату; на занятую — CONFLICT; чужая или нет такой — NOT_FOUND", async () => {
    const a = await addDate({ date: "06-02" });
    await addDate({ date: "07-01" });
    expect((await patchDate(a.id, { date: "06-05" })).date).toBe("06-05");
    await expect(patchDate(a.id, { date: "07-01" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(patchDate("d_nope", { date: "07-02" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const { caller: other } = await api.newUser();
    await expect(
      api.call(other, "PATCH", `/me/dates/${a.id}`, { label: "чужое" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      api.call(other, "DELETE", `/me/dates/${a.id}`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await dates()).find((date) => date.id === a.id)?.label).toBe(
      undefined,
    );
  });

  it("неверная дата и слишком длинное название — VALIDATION", async () => {
    await expect(addDate({ date: "02-30" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      addDate({ date: "02-01", label: "а".repeat(41) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("«Отменить» удаление возвращает номер, если он свободен", async () => {
    await addDate({ date: "06-02" });
    const other = await addDate({ date: "07-01" });
    const { date: removed, occasionReset } = await deleteDate(other.id);
    expect(occasionReset).toBe(false);
    expect(
      (
        await addDate({
          date: removed.date,
          autoNumber: removed.autoNumber,
        })
      ).title,
    ).toBe("Значимая дата 2");
    const third = await addDate({ date: "08-01" });
    await deleteDate(third.id);
    await addDate({ date: "09-01" });
    expect((await addDate({ date: "08-01", autoNumber: 3 })).title).toBe(
      "Значимая дата 4",
    );
  });

  it("напоминание за 30 дней; «Скрыть» — до следующего года", async () => {
    await api.call(me, "PATCH", "/me", { birthday: "03-14" });
    await addDate({ date: "06-02", preset: "anniversary" });
    expect(await reminders()).toEqual([]);

    await api.call(me, "PATCH", "/me", { birthday: "12-10" });
    const [birthday] = await reminders();
    expect(birthday).toMatchObject({
      id: "birthday:2026",
      kind: "birthday",
      label: "твой день рождения",
      date: "2026-12-10",
      daysLeft: 12,
    });
    const anniversary = await addDate({
      date: "12-20",
      preset: "anniversary",
    });
    expect(await dismiss("birthday:2026")).toEqual([
      {
        id: `${anniversary.id}:2026`,
        kind: "important",
        dateId: anniversary.id,
        label: "Годовщина",
        date: "2026-12-20",
        daysLeft: 22,
      },
    ]);
    await dismiss(`${anniversary.id}:2026`);
    // «После перезагрузки» — тот же ответ: скрытие лежит в профиле.
    expect(await reminders()).toEqual([]);
    await expect(
      api.call(me, "POST", "/me/reminders/nope/dismiss"),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("чужие даты и напоминания не видны", async () => {
    await api.call(me, "PATCH", "/me", { birthday: "12-10" });
    await addDate({ date: "12-01", label: "Секрет" });
    const { caller: other } = await api.newUser();
    expect(await dates(other)).toEqual([]);
    expect(await reminders(other)).toEqual([]);
  });
});
