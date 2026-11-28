import { describe, expect, it } from "vitest";

import { countPicks, pickGoalText, pickProgress, progressText } from "./model";

describe("счётчик выбора по ссылке-фильтру", () => {
  it("свежий «Хочу» считается сразу, отмена — убирает, повтор с сервера не двоится", () => {
    expect(countPicks(["a", "b"], new Map())).toBe(2);
    // Третий «Хочу» ещё не дошёл до сервера.
    expect(countPicks(["a", "b"], new Map([["c", true]]))).toBe(3);
    // Дошёл — тот же товар не считается дважды.
    expect(countPicks(["a", "b", "c"], new Map([["c", true]]))).toBe(3);
    // «Вернуть» — сервер ещё не знает, а счётчик уже меньше.
    expect(countPicks(["a", "b", "c"], new Map([["c", false]]))).toBe(2);
  });

  it("без лимита — отправить после 3, колода не останавливается", () => {
    expect(pickProgress(2)).toMatchObject({ canSend: false, left: 1 });
    expect(pickProgress(3)).toMatchObject({ canSend: true, full: false });
    expect(pickProgress(40)).toMatchObject({ canSend: true, full: false });
  });

  it("лимит 3: третий «Хочу» останавливает колоду — четвёртый не поставить", () => {
    expect(pickProgress(2, 3)).toMatchObject({ canSend: false, full: false });
    expect(pickProgress(3, 3)).toMatchObject({ canSend: true, full: true });
    // «Вернуть» одну — колода снова идёт.
    const overrides = new Map([["c", false]]);
    expect(pickProgress(countPicks(["a", "b", "c"], overrides), 3).full).toBe(
      false,
    );
  });

  it("лимит 5: отправить можно с 3, стоп на 5; лимит 1 — отправить с первым", () => {
    expect(pickProgress(3, 5)).toMatchObject({ canSend: true, full: false });
    expect(pickProgress(5, 5).full).toBe(true);
    expect(pickProgress(1, 1)).toMatchObject({ canSend: true, full: true });
  });

  it("тексты: цель на приглашении и строка под колодой", () => {
    expect(pickGoalText()).toBe("Выбери хотя бы три подарка");
    expect(pickGoalText(1)).toBe("Выбери один подарок");
    expect(pickGoalText(3)).toBe("Выбери 3 подарка");
    expect(pickGoalText(5)).toBe("Выбери от 3 до 5 подарков");
    expect(progressText(pickProgress(0, 5))).toBe("Выбери от 3 до 5 подарков");
    expect(progressText(pickProgress(1, 5))).toBe(
      "Выбрано 1 из 5. Ещё 2 подарка — и можно отправить",
    );
    expect(progressText(pickProgress(2))).toBe(
      "Ещё 1 подарок — и можно отправить",
    );
  });
});
