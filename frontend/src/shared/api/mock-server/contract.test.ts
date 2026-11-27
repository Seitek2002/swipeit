import { contractFor, routeKey } from "@swipeit/core/contract";
import { describe, expect, it } from "vitest";

import { ROUTE_TABLE } from "./routes";

// Мок привязан к контракту @swipeit/core (BACKEND.md B02): у каждого
// маршрута контракта для local есть обработчик в таблице мока, и наоборот.
describe("мок и контракт API", () => {
  it("маршруты local совпадают с таблицей мока", () => {
    const contract = contractFor("local")
      .map((item) => routeKey(item.method, item.path))
      .sort();
    const mock = ROUTE_TABLE.map((item) =>
      routeKey(item.method, item.pattern),
    ).sort();
    expect(mock).toEqual(contract);
  });
});
