import { describe, expect, it } from "vitest";

import { resolveBack } from "./model";

// «Назад» в шапке (auto-tasks-ux-6 Z06).
describe("resolveBack", () => {
  it("свой «назад» внутри потока важнее всего", () => {
    expect(
      resolveBack({ hasOnBack: true, backHref: "/plans/", historyLength: 1 }),
    ).toEqual({ kind: "custom" });
  });

  it("явный адрес — переход на него", () => {
    expect(
      resolveBack({ hasOnBack: false, backHref: "/plans/", historyLength: 5 }),
    ).toEqual({ kind: "push", href: "/plans/" });
  });

  it("есть история — шаг назад по ней", () => {
    expect(
      resolveBack({
        hasOnBack: false,
        fallbackHref: "/profile/",
        historyLength: 3,
      }),
    ).toEqual({ kind: "history" });
  });

  it("открыт по прямой ссылке — запасной адрес", () => {
    expect(
      resolveBack({
        hasOnBack: false,
        fallbackHref: "/profile/",
        historyLength: 1,
      }),
    ).toEqual({ kind: "replace", href: "/profile/" });
  });

  it("по прямой ссылке без запасного адреса — главная", () => {
    expect(resolveBack({ hasOnBack: false, historyLength: 1 })).toEqual({
      kind: "replace",
      href: "/",
    });
  });
});
