import { describe, expect, it } from "vitest";

import { reservationChatText } from "./model";

describe("текст для чата после брони (X01)", () => {
  it("подарок и чей вишлист, без ссылки", () => {
    expect(
      reservationChatText({
        title: "Наушники Apple AirPods 4",
        ownerName: "Тимур",
      }),
    ).toBe("Беру „Наушники Apple AirPods 4“ из вишлиста Тимур — не дублируйте");
  });

  it("лишние пробелы в названии и имени убираются", () => {
    expect(reservationChatText({ title: " Плед ", ownerName: " Нурай " })).toBe(
      "Беру „Плед“ из вишлиста Нурай — не дублируйте",
    );
  });

  it("имя владельца неизвестно — без «из вишлиста»", () => {
    expect(reservationChatText({ title: "Плед", ownerName: "" })).toBe(
      "Беру „Плед“ — не дублируйте",
    );
  });

  it("в тексте нет ссылки", () => {
    expect(
      reservationChatText({ title: "Термос, 1 л", ownerName: "Данияр" }),
    ).not.toMatch(/https?:|\/w\//);
  });
});
