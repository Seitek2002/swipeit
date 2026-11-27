import { describe, expect, it } from "vitest";

import {
  decideDirection,
  decidePhotoDirection,
  lockAxis,
  photoProgress,
  photoRotation,
  progressFor,
  rotationFor,
  scrollProgressFor,
  stampOpacities,
  velocityOf,
} from "./model";

const base = {
  cardWidth: 300,
  cardHeight: 420,
  directions: ["left", "right", "up"] as const,
  velocity: { x: 0, y: 0 },
};

describe("физика свайпа", () => {
  it("наклон: x/20, максимум 15°, знак меняется при хвате снизу", () => {
    expect(rotationFor(100, true)).toBe(5);
    expect(rotationFor(100, false)).toBe(-5);
    expect(rotationFor(1000, true)).toBe(15);
    expect(rotationFor(-1000, true)).toBe(-15);
  });

  it("штампы: ХОЧУ вправо, МИМО влево, ОЧЕНЬ вверх — по одному", () => {
    expect(stampOpacities(50, 0, true)).toEqual({ left: 0, right: 0.5, up: 0 });
    expect(stampOpacities(-200, 0, true)).toEqual({ left: 1, right: 0, up: 0 });
    expect(stampOpacities(20, -80, true)).toEqual({
      left: 0,
      right: 0,
      up: 0.8,
    });
    // Без направления «вверх» вертикаль штамп не включает.
    expect(stampOpacities(20, -80, false).up).toBe(0);
  });

  it("прогресс доходит до 1 на 35% ширины", () => {
    expect(progressFor(105, 0, 300, true)).toBe(1);
    expect(progressFor(52.5, 0, 300, true)).toBeCloseTo(0.5);
  });

  it("медленный сдвиг на 30% — назад, на 36% — улетает", () => {
    expect(decideDirection({ ...base, x: 90, y: 0 })).toBeNull();
    expect(decideDirection({ ...base, x: 108, y: 0 })).toBe("right");
    expect(decideDirection({ ...base, x: -108, y: 0 })).toBe("left");
  });

  it("быстрый флик улетает даже при маленьком сдвиге", () => {
    expect(
      decideDirection({ ...base, x: 30, y: 0, velocity: { x: 900, y: 0 } }),
    ).toBe("right");
    expect(
      decideDirection({ ...base, x: 5, y: 0, velocity: { x: 900, y: 0 } }),
    ).toBeNull();
  });

  it("вверх — только если разрешено", () => {
    expect(decideDirection({ ...base, x: 10, y: -120 })).toBe("up");
    expect(
      decideDirection({
        ...base,
        directions: ["left", "right"],
        x: 10,
        y: -120,
      }),
    ).toBeNull();
  });

  it("скорость считается по последним 100 ms", () => {
    const samples = [
      { t: 0, x: 0, y: 0 },
      { t: 200, x: 10, y: 0 },
      { t: 250, x: 40, y: 0 },
      { t: 300, x: 100, y: 0 },
    ];
    expect(velocityOf(samples).x).toBeCloseTo(900);
  });
});

describe("физика колоды подарков", () => {
  it("ось решается по первым 10px", () => {
    expect(lockAxis(4, 5)).toBeNull();
    expect(lockAxis(10, 4)).toBe("x");
    expect(lockAxis(-3, 12)).toBe("y");
    expect(lockAxis(7, -8)).toBe("y");
  });

  it("наклон ±12° на ±200px и не больше", () => {
    expect(photoRotation(100)).toBe(6);
    expect(photoRotation(-200)).toBe(-12);
    expect(photoRotation(500)).toBe(12);
  });

  it("порог 120px или 700 px/s", () => {
    expect(decidePhotoDirection(100, 0)).toBeNull();
    expect(decidePhotoDirection(130, 0)).toBe("right");
    expect(decidePhotoDirection(-130, 0)).toBe("left");
    expect(decidePhotoDirection(30, 900)).toBe("right");
    expect(decidePhotoDirection(-30, -900)).toBe("left");
  });

  it("прогресс сдвига и прокрутки", () => {
    expect(photoProgress(-60)).toBe(0.5);
    expect(photoProgress(400)).toBe(1);
    expect(scrollProgressFor(60)).toBe(0.5);
    expect(scrollProgressFor(300)).toBe(1);
  });
});
