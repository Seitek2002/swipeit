import { describe, expect, it } from "vitest";

import { CONTRACT, contractFor, routeKey } from "./contract";

describe("контракт API", () => {
  it("без повторов", () => {
    const keys = CONTRACT.map((item) => routeKey(item.method, item.path));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("демо-маршрутов нет на сервере, входа через Telegram — в демо", () => {
    const remote = new Set(
      contractFor("remote").map((item) => routeKey(item.method, item.path)),
    );
    expect(remote.has("POST /auth/demo")).toBe(false);
    expect(remote.has("POST /plans/expire")).toBe(false);
    expect(remote.has("GET /demo/settings")).toBe(false);
    expect(
      contractFor("local").some((item) => item.path === "/auth/telegram"),
    ).toBe(false);
  });
});
