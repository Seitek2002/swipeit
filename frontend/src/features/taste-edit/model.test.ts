import { describe, expect, it } from "vitest";

import { INTEREST_IDS } from "@/shared/config";

import {
  type TasteAction,
  type TasteState,
  applyTasteAction,
  tasteGroups,
  tastePatch,
} from "./model";

const state = (patch: Partial<TasteState> = {}): TasteState => ({
  interests: ["music", "coffee"],
  mutedInterests: ["cars"],
  inferredInterests: ["gadgets", "travel"],
  ...patch,
});

describe("applyTasteAction", () => {
  it("подтверждение догадки переносит её в свои", () => {
    const next = applyTasteAction(state(), { type: "add", id: "gadgets" });
    expect(next.interests).toEqual(["music", "coffee", "gadgets"]);
    expect(next.inferredInterests).toEqual(["travel"]);
    expect(next.mutedInterests).toEqual(["cars"]);
  });

  it("выбор из «Все интересы» снимает «Не моё»", () => {
    const next = applyTasteAction(state(), { type: "add", id: "cars" });
    expect(next.interests).toContain("cars");
    expect(next.mutedInterests).toEqual([]);
  });

  it("повторное добавление не дублирует", () => {
    const next = applyTasteAction(state(), { type: "add", id: "music" });
    expect(next.interests).toEqual(["music", "coffee"]);
  });

  it("«Не моё» убирает догадку и свой интерес", () => {
    const muted = applyTasteAction(state(), { type: "mute", id: "travel" });
    expect(muted.inferredInterests).toEqual(["gadgets"]);
    expect(muted.mutedInterests).toEqual(["cars", "travel"]);

    const own = applyTasteAction(state(), { type: "mute", id: "music" });
    expect(own.interests).toEqual(["coffee"]);
    expect(own.mutedInterests).toEqual(["cars", "music"]);
  });

  it("снятие своего не трогает остальные списки", () => {
    const next = applyTasteAction(state(), { type: "remove", id: "coffee" });
    expect(next).toEqual(state({ interests: ["music"] }));
  });

  it("не меняет исходное состояние", () => {
    const before = state();
    applyTasteAction(before, { type: "mute", id: "music" });
    expect(before).toEqual(state());
  });

  it("цепочка действий = оптимистичный вид нескольких тапов подряд", () => {
    const actions: TasteAction[] = [
      { type: "add", id: "gadgets" },
      { type: "mute", id: "travel" },
      { type: "remove", id: "music" },
    ];
    expect(actions.reduce(applyTasteAction, state())).toEqual({
      interests: ["coffee", "gadgets"],
      mutedInterests: ["cars", "travel"],
      inferredInterests: [],
    });
  });
});

describe("tastePatch", () => {
  it("add и remove шлют только interests", () => {
    expect(tastePatch(state(), { type: "add", id: "gadgets" })).toEqual({
      interests: ["music", "coffee", "gadgets"],
    });
    expect(tastePatch(state(), { type: "remove", id: "music" })).toEqual({
      interests: ["coffee"],
    });
  });

  it("mute шлёт только mutedInterests — без одного id в двух списках", () => {
    const patch = tastePatch(state(), { type: "mute", id: "music" });
    expect(patch).toEqual({ mutedInterests: ["cars", "music"] });
    expect(patch.interests).toBeUndefined();
  });

  it("неизвестные id не уходят на сервер", () => {
    const old = state({ interests: ["music", "knitting"] });
    expect(tastePatch(old, { type: "add", id: "art" })).toEqual({
      interests: ["music", "art"],
    });
  });
});

describe("tasteGroups", () => {
  it("раскладывает 20 интересов по трём группам без пересечений", () => {
    const groups = tasteGroups(state());
    expect(groups.own).toEqual(["music", "coffee"]);
    expect(groups.inferred).toEqual(["gadgets", "travel"]);
    expect(groups.rest).toHaveLength(INTEREST_IDS.length - 4);
    expect(groups.rest).toContain("cars");
    const all = [...groups.own, ...groups.inferred, ...groups.rest];
    expect(new Set(all).size).toBe(INTEREST_IDS.length);
  });

  it("догадка, уже своя или «Не моё», не показывается", () => {
    const groups = tasteGroups(
      state({ inferredInterests: ["music", "cars", "photo"] }),
    );
    expect(groups.inferred).toEqual(["photo"]);
  });

  it("неизвестные id и дубли отбрасываются", () => {
    const groups = tasteGroups(
      state({
        interests: ["music", "music", "knitting"],
        inferredInterests: ["unknown", "art"],
      }),
    );
    expect(groups.own).toEqual(["music"]);
    expect(groups.inferred).toEqual(["art"]);
  });
});
