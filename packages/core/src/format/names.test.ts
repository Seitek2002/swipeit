import { describe, expect, it } from "vitest";

import { dative, genitive, hasNamesakes, sameName } from "./names";

describe("genitive — «от кого»", () => {
  it("мужские имена на согласную", () => {
    expect(genitive("Азамат", "male")).toBe("Азамата");
    expect(genitive("Тимур", "male")).toBe("Тимура");
    expect(genitive("Андрей", "male")).toBe("Андрея");
  });

  it("имена на -а/-я", () => {
    expect(genitive("Алина")).toBe("Алины");
    expect(genitive("Ольга")).toBe("Ольги");
    expect(genitive("Таня")).toBe("Тани");
  });

  it("женские имена на согласную и неизвестный пол — без изменений", () => {
    expect(genitive("Айгерим", "female")).toBe("Айгерим");
    expect(genitive("Нурай", "female")).toBe("Нурай");
    expect(genitive("Данияр")).toBe("Данияр");
  });
});

describe("dative — «кому»", () => {
  it("склоняет мужские на согласную, -а/-я и -ия", () => {
    expect(dative("Азамат", "male")).toBe("Азамату");
    expect(dative("Андрей", "male")).toBe("Андрею");
    expect(dative("Алина")).toBe("Алине");
    expect(dative("Таня")).toBe("Тане");
    expect(dative("Мария")).toBe("Марии");
  });

  it("женские на согласную и неизвестный пол — без изменений", () => {
    expect(dative("Айгерим", "female")).toBe("Айгерим");
    expect(dative("Данияр")).toBe("Данияр");
  });
});

describe("тёзки (R04)", () => {
  it("одно имя без регистра, пробелов и с «ё» = «е»", () => {
    expect(sameName("Азамат", "азамат ")).toBe(true);
    expect(sameName("Алёна", "Алена")).toBe(true);
    expect(sameName("Азамат", "Азамат К.")).toBe(false);
    expect(sameName("", "")).toBe(false);
  });

  it("hasNamesakes — есть ли два одинаковых имени", () => {
    expect(hasNamesakes(["Нурай", "Азамат", "азамат"])).toBe(true);
    expect(hasNamesakes(["Нурай", "Азамат К.", "Азамат"])).toBe(false);
  });
});
