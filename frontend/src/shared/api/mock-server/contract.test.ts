import { contractFor, featureRoutes, routeKey } from "@swipeit/core/contract";
import { describe, expect, it } from "vitest";

import { ROUTE_TABLE } from "./routes";

// Мок привязан к контракту @swipeit/core (BACKEND.md B02): у каждого
// маршрута контракта для local есть обработчик в таблице мока, и наоборот.
describe("мок и контракт API", () => {
  const mock = ROUTE_TABLE.map((item) => routeKey(item.method, item.pattern));
  // Маршруты нескольких вишлистов появляются в моке по задачам L04–L07
  // (spec-multi-wishlists): пока обработчика нет — todo, а не падение.
  const pending = featureRoutes("multiWishlists")
    .map((item) => routeKey(item.method, item.path))
    .filter((key) => !mock.includes(key));

  it("маршруты local совпадают с таблицей мока", () => {
    const contract = contractFor("local")
      .map((item) => routeKey(item.method, item.path))
      .filter((key) => !pending.includes(key))
      .sort();
    expect([...mock].sort()).toEqual(contract);
  });

  for (const key of pending) it.todo(`мок: ${key}`);
});
