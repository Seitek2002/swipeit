import { describe, expect, it } from "vitest";

import {
  FADE_MS,
  MAX_SHOW_MS,
  MIN_FIRST_OPEN_MS,
  SETTLE_MS,
  createPreloaderController,
} from "./controller";

// Ручные часы: таймеры срабатывают, когда «время» до них дошло.
const setup = (seenBefore: boolean, start = 0) => {
  let time = start;
  let nextId = 0;
  const timers = new Map<number, { at: number; callback: () => void }>();
  const state = { removed: false, seen: false };
  const controller = createPreloaderController({
    seenBefore,
    now: () => time,
    setTimer: (callback, ms) => {
      nextId += 1;
      timers.set(nextId, { at: time + ms, callback });
      return nextId;
    },
    clearTimer: (id) => timers.delete(id as number),
    markSeen: () => {
      state.seen = true;
    },
    removeNode: () => {
      state.removed = true;
    },
  });
  const advance = (ms: number) => {
    const until = time + ms;
    for (;;) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.at <= until)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      timers.delete(due[0]);
      time = due[1].at;
      due[1].callback();
    }
    time = until;
  };
  return { controller, advance, state };
};

describe("прелоадер", () => {
  it("первое открытие: не раньше 1.1s, даже если всё готово сразу", () => {
    const { controller, advance, state } = setup(false, 200);
    controller.appSettled();
    advance(SETTLE_MS);
    expect(state.removed).toBe(false);
    advance(MIN_FIRST_OPEN_MS);
    expect(state.removed).toBe(true);
    expect(state.seen).toBe(true);
  });

  it("повторное открытие: уходит сразу, как всё готово", () => {
    const { controller, advance, state } = setup(true, 300);
    controller.appSettled();
    advance(SETTLE_MS);
    expect(state.removed).toBe(true);
  });

  it("ждёт удержания экрана, поставленные сразу после готовности", () => {
    const { controller, advance, state } = setup(true);
    controller.appSettled();
    controller.hold("feed");
    advance(1000);
    expect(state.removed).toBe(false);
    controller.release("feed");
    advance(SETTLE_MS);
    expect(state.removed).toBe(true);
  });

  it("смена удержаний в одном кадре (уход с «/» в ленту) не открывает пустой экран", () => {
    const { controller, advance, state } = setup(true);
    controller.hold("home");
    controller.appSettled();
    controller.release("home");
    controller.hold("feed");
    advance(SETTLE_MS * 4);
    expect(state.removed).toBe(false);
  });

  it("не дольше 4s, даже если экран так и не отпустил", () => {
    const { controller, advance, state } = setup(true);
    controller.hold("feed");
    advance(MAX_SHOW_MS - 1);
    expect(state.removed).toBe(false);
    advance(1);
    expect(state.removed).toBe(true);
    expect(controller.isHidden()).toBe(true);
  });

  it("без готовности приложения не уходит до предела", () => {
    const { advance, state } = setup(true);
    advance(MAX_SHOW_MS - FADE_MS);
    expect(state.removed).toBe(false);
  });

  it("после скрытия удержания ничего не делают", () => {
    const { controller, advance, state } = setup(true);
    controller.appSettled();
    advance(SETTLE_MS);
    expect(state.removed).toBe(true);
    controller.hold("feed");
    controller.release("feed");
    advance(SETTLE_MS);
    expect(controller.isHidden()).toBe(true);
  });
});
