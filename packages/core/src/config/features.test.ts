import { describe, expect, it } from "vitest";

import {
  multiWishlistsOnClient,
  multiWishlistsOnServer,
  parseFeatureFlag,
} from "./features";

describe("флаг «несколько вишлистов»", () => {
  it("значения флага", () => {
    expect(parseFeatureFlag("1")).toBe(true);
    expect(parseFeatureFlag(" TRUE ")).toBe(true);
    expect(parseFeatureFlag("0")).toBe(false);
    expect(parseFeatureFlag("off")).toBe(false);
    expect(parseFeatureFlag("")).toBeUndefined();
    expect(parseFeatureFlag(undefined)).toBeUndefined();
    expect(parseFeatureFlag("может быть")).toBeUndefined();
  });

  it("фронт: в демо включено, в remote — только с «1»", () => {
    expect(multiWishlistsOnClient("local", undefined)).toBe(true);
    expect(multiWishlistsOnClient("lan", undefined)).toBe(true);
    expect(multiWishlistsOnClient("remote", undefined)).toBe(false);
    expect(multiWishlistsOnClient("remote", "1")).toBe(true);
    expect(multiWishlistsOnClient("local", "0")).toBe(false);
  });

  it("сервер: в production выключено, в dev и тестах включено", () => {
    expect(multiWishlistsOnServer("production", undefined)).toBe(false);
    expect(multiWishlistsOnServer("production", "1")).toBe(true);
    expect(multiWishlistsOnServer("development", undefined)).toBe(true);
    expect(multiWishlistsOnServer("test", undefined)).toBe(true);
    expect(multiWishlistsOnServer(undefined, undefined)).toBe(true);
    expect(multiWishlistsOnServer("test", "0")).toBe(false);
  });
});
