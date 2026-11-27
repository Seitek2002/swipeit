import type {
  MyReservation,
  Reservation,
  SwipeResponse,
} from "@swipeit/core/api/wishlist/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS } from "./client";

// «Я дарю» — свои брони (auto-tasks P02): тот же сценарий на моке и сервере.
describe.each(CLIENTS)("«Я дарю» — %s", (_name, create) => {
  let api: ApiClient;
  beforeEach(async () => {
    api = await create();
  });
  afterEach(() => api.close());

  const person = async (patch: Record<string, unknown>) => {
    const { caller } = await api.newUser();
    await api.call(caller, "PATCH", "/me", patch);
    return caller;
  };
  // Владелец с одним желанием и поводом.
  const owner = async (
    name: string,
    productId: string,
    occasion: Record<string, unknown>,
    birthday?: string,
  ) => {
    const caller = await person({ name, ...(birthday ? { birthday } : {}) });
    const swipe = await api.call<SwipeResponse>(caller, "POST", "/swipes", {
      productId,
      decision: "like",
      context: { kind: "self" },
    });
    await api.call(caller, "PATCH", "/wishlist/meta", { occasion });
    return { caller, itemId: swipe.wishlistItemId ?? "" };
  };
  const reserve = (who: Caller, ownerId: string, itemKey: string) =>
    api.call<Reservation>(who, "POST", "/reservations", { ownerId, itemKey });
  const mine = (who: Caller) =>
    api.call<MyReservation[]>(who, "GET", "/me/reservations");

  it("брони у двух друзей — по ближайшей дате; снял — одна; «подарили» — closed", async () => {
    const aigerim = await owner(
      "Айгерим",
      "p_0001",
      { kind: "birthday" },
      "03-14",
    );
    const bakyt = await owner("Бакыт", "p_0002", { kind: "new_year" });
    const giver = await person({ name: "Нурай" });
    await api.befriend(giver, aigerim.caller);
    await api.befriend(giver, bakyt.caller);
    expect(await mine(giver)).toEqual([]);

    const first = await reserve(giver, aigerim.caller.id, "p_0001");
    await reserve(giver, bakyt.caller.id, "p_0002");
    const list = await mine(giver);
    expect(list.map((entry) => entry.owner.name)).toEqual(["Бакыт", "Айгерим"]);
    expect(list[1]).toMatchObject({
      id: first.id,
      itemKey: "p_0001",
      closed: false,
      owner: { id: aigerim.caller.id, name: "Айгерим" },
      item: { productId: "p_0001" },
      occasion: { kind: "birthday", date: "2027-03-14" },
    });

    const bakytReservation = list[0]?.id ?? "";
    await api.call(giver, "DELETE", `/reservations/${bakytReservation}`);
    expect((await mine(giver)).map((entry) => entry.owner.name)).toEqual([
      "Айгерим",
    ]);

    await api.call(
      aigerim.caller,
      "POST",
      `/wishlist/items/${aigerim.itemId}/given`,
      { at: "2026-11-27T10:00:00.000Z" },
    );
    expect(await mine(giver)).toEqual([
      expect.objectContaining({ id: first.id, closed: true }),
    ]);
  });

  it("только свои брони: чужих бронирующих в ответе нет", async () => {
    const aigerim = await owner("Айгерим", "p_0001", { kind: "march_8" });
    await api.call(aigerim.caller, "POST", "/swipes", {
      productId: "p_0002",
      decision: "like",
      context: { kind: "self" },
    });
    const giver = await person({ name: "Нурай" });
    const other = await person({ name: "Тайный Даритель" });
    await api.befriend(giver, aigerim.caller);
    await api.befriend(other, aigerim.caller);
    await reserve(giver, aigerim.caller.id, "p_0001");
    await reserve(other, aigerim.caller.id, "p_0002");
    const list = await mine(giver);
    expect(list).toHaveLength(1);
    expect(JSON.stringify(list)).not.toContain("Тайный Даритель");
    expect(JSON.stringify(list)).not.toContain(other.id);
    // У владельца своих броней нет.
    expect(await mine(aigerim.caller)).toEqual([]);
  });
});
