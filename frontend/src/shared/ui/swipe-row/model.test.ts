import { describe, expect, it } from "vitest";

import { shouldOpenSwipeRow } from "./model";

// Блок действий шириной 160px: 40% — это 64px.
const width = 160;

describe("SwipeRow: закрытая строка", () => {
  it("открывается, если протянули больше 40% ширины действий", () => {
    expect(
      shouldOpenSwipeRow({ position: -70, velocity: 0, wasOpen: false, width }),
    ).toBe(true);
  });

  it("остаётся закрытой, если протянули меньше", () => {
    expect(
      shouldOpenSwipeRow({ position: -50, velocity: 0, wasOpen: false, width }),
    ).toBe(false);
    expect(
      shouldOpenSwipeRow({ position: -64, velocity: 0, wasOpen: false, width }),
    ).toBe(false);
  });

  it("быстрый смах влево открывает даже с малым сдвигом", () => {
    expect(
      shouldOpenSwipeRow({
        position: -10,
        velocity: -800,
        wasOpen: false,
        width,
      }),
    ).toBe(true);
  });

  it("скорость на пороге не считается смахом", () => {
    expect(
      shouldOpenSwipeRow({
        position: -10,
        velocity: -500,
        wasOpen: false,
        width,
      }),
    ).toBe(false);
  });
});

describe("SwipeRow: открытая строка", () => {
  it("остаётся открытой, если чуть сдвинули вправо", () => {
    expect(
      shouldOpenSwipeRow({ position: -130, velocity: 0, wasOpen: true, width }),
    ).toBe(true);
  });

  it("закрывается, если протянули вправо больше 40% ширины", () => {
    expect(
      shouldOpenSwipeRow({ position: -80, velocity: 0, wasOpen: true, width }),
    ).toBe(false);
  });

  it("быстрый смах вправо закрывает", () => {
    expect(
      shouldOpenSwipeRow({
        position: -150,
        velocity: 900,
        wasOpen: true,
        width,
      }),
    ).toBe(false);
  });

  it("смах влево оставляет открытой", () => {
    expect(
      shouldOpenSwipeRow({
        position: -60,
        velocity: -700,
        wasOpen: true,
        width,
      }),
    ).toBe(true);
  });
});

describe("SwipeRow: без действий", () => {
  it("не открывается, пока ширина неизвестна", () => {
    expect(
      shouldOpenSwipeRow({
        position: -50,
        velocity: -900,
        wasOpen: false,
        width: 0,
      }),
    ).toBe(false);
  });
});
