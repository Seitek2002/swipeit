import { describe, expect, it } from "vitest";

import { drumLabels } from "./model";

describe("подписи барабана (P12)", () => {
  it("есть совпадения — как раньше, без пояснения", () => {
    expect(drumLabels("matches")).toEqual({
      hint: null,
      button: "Крутить барабан",
      forGuests: "Барабан крутит организатор — все увидят, что выпало.",
    });
  });

  it("только «Почти» — честно: пояснение и «Крутить среди „Почти“»", () => {
    const labels = drumLabels("almost");
    expect(labels.hint).toBe("Полных совпадений нет, ближе всего — эти");
    expect(labels.button).toBe("Крутить среди «Почти»");
    expect(labels.forGuests).toContain("среди «Почти»");
  });

  it("ничего — подписи барабана не нужны (экран «Никто не совпал»), без пояснения", () => {
    expect(drumLabels("none").hint).toBeNull();
  });
});
