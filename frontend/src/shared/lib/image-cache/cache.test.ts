import { describe, expect, it } from "vitest";

import { LOAD_TIMEOUT_MS, createImageCache } from "./cache";

// Поддельная картинка: загрузку завершает тест.
const setup = () => {
  const started: string[] = [];
  const cancelled: string[] = [];
  const pending = new Map<
    string,
    { reject: () => void; resolve: () => void }
  >();
  const timers: Array<{ callback: () => void; ms: number }> = [];
  const cache = createImageCache({
    createImage: () => {
      let current = "";
      return {
        get src() {
          return current;
        },
        set src(value: string) {
          if (value === "" && current) cancelled.push(current);
          else started.push(value);
          current = value;
        },
        decode: () =>
          new Promise<void>((resolve, reject) => {
            queueMicrotask(() => pending.set(current, { resolve, reject }));
          }),
      };
    },
    setTimer: (callback, ms) => timers.push({ callback, ms }) - 1,
    clearTimer: () => undefined,
  });
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
  const finish = async (src: string) => {
    await flush();
    pending.get(src)?.resolve();
    await flush();
  };
  return { cache, started, cancelled, finish, flush, timers };
};

describe("кеш картинок колоды", () => {
  it("не больше двух загрузок, дальше — по порядку окна", async () => {
    const { cache, started, finish } = setup();
    cache.setGroup("deck", ["a", "b", "c"]);
    expect(started).toEqual(["a", "b"]);
    expect(cache.getStatus("c")).toBe("queued");
    await finish("a");
    expect(cache.getStatus("a")).toBe("ready");
    expect(started).toEqual(["a", "b", "c"]);
  });

  it("выпавшее из окна отменяется, готовое остаётся", async () => {
    const { cache, cancelled, finish } = setup();
    cache.setGroup("deck", ["a", "b"]);
    await finish("a");
    cache.setGroup("deck", ["c"]);
    expect(cancelled).toEqual(["b"]);
    expect(cache.getStatus("b")).toBe("idle");
    expect(cache.getStatus("a")).toBe("ready");
  });

  it("открытое фото не ждёт: третье место, фоновые не обрываются", () => {
    const { cache, started, cancelled } = setup();
    cache.setGroup("deck", ["a", "b", "c", "d"]);
    cache.show("d");
    expect(cancelled).toEqual([]);
    expect(started).toEqual(["a", "b", "d"]);
    expect(cache.getStatus("c")).toBe("queued");
  });

  it("дольше 8 с — ошибка, «Повторить» грузит заново", () => {
    const { cache, started, timers } = setup();
    const hide = cache.show("a");
    const timer = timers.find((item) => item.ms === LOAD_TIMEOUT_MS);
    timer?.callback();
    expect(cache.getStatus("a")).toBe("error");
    cache.retry("a");
    expect(cache.getStatus("a")).toBe("loading");
    expect(started).toEqual(["a", "a"]);
    hide();
  });
});
