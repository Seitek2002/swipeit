import { describe, expect, it } from "vitest";

import {
  approveWarning,
  drumLabels,
  resultNote,
  voteProgress,
  voteStatus,
} from "./model";

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

describe("кто проголосовал в «Выбрать самим» (X04)", () => {
  const PEOPLE = [
    { id: "u_aigerim", name: "Айгерим" },
    { id: "u_azamat", name: "Азамат" },
    { id: "u_timur", name: "Тимур" },
    { id: "u_meerim", name: "Мээрим" },
  ];
  const CANDIDATES = ["katok", "kino"];

  it("ждём троих — имена в порядке участников, «Утвердить» с подтверждением", () => {
    const progress = voteProgress(PEOPLE, { u_aigerim: "katok" }, CANDIDATES);
    expect(progress).toEqual({
      total: 4,
      voted: 1,
      waiting: ["Азамат", "Тимур", "Мээрим"],
    });
    expect(voteStatus(progress)).toBe(
      "Проголосовали 1 из 4 · ждём: Азамат, Тимур, Мээрим",
    );
  });

  it("ждём двоих", () => {
    const progress = voteProgress(
      PEOPLE,
      { u_aigerim: "katok", u_azamat: "kino" },
      CANDIDATES,
    );
    expect(voteStatus(progress)).toBe(
      "Проголосовали 2 из 4 · ждём: Тимур, Мээрим",
    );
    expect(approveWarning(progress)).toBe(
      "Не все проголосовали (ждём: Тимур, Мээрим). Утвердить сейчас?",
    );
  });

  it("ждём одного; голос не за кандидата не считается", () => {
    const progress = voteProgress(
      PEOPLE,
      {
        u_aigerim: "katok",
        u_azamat: "kino",
        u_meerim: "katok",
        u_timur: "old_card",
        u_left: "katok",
      },
      CANDIDATES,
    );
    expect(voteStatus(progress)).toBe("Проголосовали 3 из 4 · ждём: Тимур");
    expect(approveWarning(progress)).toBe(
      "Не все проголосовали (ждём: Тимур). Утвердить сейчас?",
    );
  });

  it("никого не ждём — «Все проголосовали», без подтверждения", () => {
    const votes = Object.fromEntries(PEOPLE.map(({ id }) => [id, "kino"]));
    const progress = voteProgress(PEOPLE, votes, CANDIDATES);
    expect(voteStatus(progress)).toBe("Все проголосовали");
    expect(approveWarning(progress)).toBeNull();
  });

  it("больше пяти ждём — пять имён и «и ещё N»", () => {
    const many = Array.from({ length: 8 }, (_, index) => ({
      id: `u_${index}`,
      name: `Друг ${index + 1}`,
    }));
    expect(voteStatus(voteProgress(many, { u_0: "kino" }, CANDIDATES))).toBe(
      "Проголосовали 1 из 8 · ждём: Друг 2, Друг 3, Друг 4, Друг 5, Друг 6 и ещё 2",
    );
  });
});
