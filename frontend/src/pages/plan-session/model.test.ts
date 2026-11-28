import { describe, expect, it } from "vitest";

import { drumLabels, resultNote } from "./model";

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

describe("подпись строки итогов (W05)", () => {
  it("обычные итоги — как раньше", () => {
    expect(resultNote("match", 4, 4, false)).toBe("все 4 — «Все за»");
    expect(resultNote("match", 3, 4, false)).toBe("3 из 4 — большинство за");
    expect(resultNote("almost", 3, 4, false)).toBe("3 из 4 — «Почти»");
  });

  it("после «Показать итоги сейчас» — из долиставших, без «большинства» при «Все за»", () => {
    expect(resultNote("match", 2, 2, true)).toBe("2 из 2 долиставших — все за");
    expect(resultNote("match", 2, 3, true)).toBe(
      "2 из 3 долиставших — большинство за",
    );
    expect(resultNote("almost", 2, 3, true)).toBe(
      "2 из 3 долиставших — «Почти»",
    );
  });
});
