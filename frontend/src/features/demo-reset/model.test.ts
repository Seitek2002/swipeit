import { describe, expect, it } from "vitest";

import { DEMO_DEVICE_KEYS, clearDemoDeviceState } from "./model";

const memoryStorage = (entries: Record<string, string>) => {
  const data = new Map(Object.entries(entries));
  return {
    data,
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
};

describe("сброс демо-данных на устройстве (G10)", () => {
  it("убирает фильтры, гостя и показанную плашку Санты", () => {
    const storage = memoryStorage({
      "swipeit:gift-filters": '{"state":{"filters":{"priceMax":2000}}}',
      "swipeit:guest": '{"state":{"guestId":"g_1","name":"Эрлан"}}',
      "swipeit:santa-nudge-intro": '["sg_1"]',
      "swipeit:hints": '["deck_guide"]',
      "swipeit:wishlist-sent": '{"state":{"byUser":{"u_1":"w_1"}}}',
      "swipeit:demo-settings": '{"state":{"demoMode":true}}',
    });
    clearDemoDeviceState(storage);
    expect(storage.data.has("swipeit:gift-filters")).toBe(false);
    expect(storage.data.has("swipeit:guest")).toBe(false);
    expect(storage.data.has("swipeit:santa-nudge-intro")).toBe(false);
    expect(storage.data.has("swipeit:hints")).toBe(false);
    expect(storage.data.has("swipeit:wishlist-sent")).toBe(false);
    // Настройки показа — не данные: остаются.
    expect(storage.data.has("swipeit:demo-settings")).toBe(true);
  });

  it("список ключей — тот, что обещает G10", () => {
    expect(DEMO_DEVICE_KEYS).toEqual(
      expect.arrayContaining([
        "swipeit:gift-filters",
        "swipeit:guest",
        "swipeit:santa-nudge-intro",
      ]),
    );
  });

  it("без хранилища и с ошибкой хранилища — без падения", () => {
    expect(() => clearDemoDeviceState(undefined)).not.toThrow();
    expect(() =>
      clearDemoDeviceState({
        removeItem: () => {
          throw new Error("SecurityError");
        },
      }),
    ).not.toThrow();
  });
});
