import { describe, expect, it } from "vitest";

import { demoFriendIds } from "./model";

const friend = (id: string, isBot: boolean) => ({ user: { id, isBot } });

describe("игра с демо-друзьями (Z05)", () => {
  it("первые три бота, люди не отмечаются", () => {
    expect(
      demoFriendIds([
        friend("u_human", false),
        friend("b_1", true),
        friend("b_2", true),
        friend("b_3", true),
        friend("b_4", true),
      ]),
    ).toEqual(["b_1", "b_2", "b_3"]);
  });

  it("ботов меньше трёх или нет — сколько есть", () => {
    expect(demoFriendIds([friend("b_1", true), friend("u", false)])).toEqual([
      "b_1",
    ]);
    expect(demoFriendIds([])).toEqual([]);
  });
});
