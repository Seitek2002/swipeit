import type { MeResponse } from "@swipeit/core/api/users/types";
import { AVATAR_COLORS } from "@swipeit/core/config";
import { isApiError } from "@swipeit/core/errors";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, CLIENTS } from "./client";

// Контрактный тест профиля (BACKEND.md B04): тот же сценарий на моке и на
// сервере даёт то же поведение.
describe.each(CLIENTS)("профиль — %s", (_name, create) => {
  let api: ApiClient;
  beforeEach(async () => {
    api = await create();
  });
  afterEach(() => api.close());

  it("новый профиль — без имени, со случайным фоном, без интересов, «всем»", async () => {
    const { me } = await api.newUser();
    expect(me.id).toMatch(/^u_/);
    expect(me.name).toBeUndefined();
    expect(AVATAR_COLORS).toContain(me.avatarColor);
    expect(me.interests).toEqual([]);
    expect(me.audience).toBe("all");
    expect(me.inferredInterests).toEqual([]);
  });

  it("GET /me — свой профиль; PATCH /me меняет имя, фон и день рождения", async () => {
    const { caller } = await api.newUser();
    const patched = await api.call<MeResponse>(caller, "PATCH", "/me", {
      name: "Айгерим",
      avatarColor: "mint",
      birthday: "03-14",
    });
    expect(patched).toMatchObject({
      name: "Айгерим",
      avatarColor: "mint",
      birthday: "03-14",
    });
    const me = await api.call<MeResponse>(caller, "GET", "/me");
    expect(me).toMatchObject({ name: "Айгерим", birthday: "03-14" });
    const cleared = await api.call<MeResponse>(caller, "PATCH", "/me", {
      birthday: null,
    });
    expect(cleared.birthday).toBeUndefined();
  });

  it("свой интерес снимает «Не моё» и наоборот; оба сразу — VALIDATION", async () => {
    const { caller } = await api.newUser();
    await api.call(caller, "PATCH", "/me", { mutedInterests: ["gadgets"] });
    const me = await api.call<MeResponse>(caller, "PATCH", "/me", {
      interests: ["gadgets", "coffee", "gadgets"],
    });
    expect(me.interests).toEqual(["gadgets", "coffee"]);
    expect(me.mutedInterests ?? []).toEqual([]);
    const error = await api
      .call(caller, "PATCH", "/me", {
        interests: ["coffee"],
        mutedInterests: ["coffee"],
      })
      .catch((reason: unknown) => reason);
    expect(isApiError(error) && error.code).toBe("VALIDATION");
  });

  it("POST /me/hints — подсказка отмечена, повтор ничего не меняет", async () => {
    const { caller } = await api.newUser();
    await api.call(caller, "POST", "/me/hints", { id: "deck_guide" });
    const me = await api.call<MeResponse>(caller, "POST", "/me/hints", {
      id: "deck_guide",
    });
    expect(me.seenHints).toEqual(["deck_guide"]);
  });

  it("неверное тело — VALIDATION", async () => {
    const { caller } = await api.newUser();
    const error = await api
      .call(caller, "PATCH", "/me", { avatarColor: "фиолетовый" })
      .catch((reason: unknown) => reason);
    expect(isApiError(error) && error.code).toBe("VALIDATION");
  });
});
