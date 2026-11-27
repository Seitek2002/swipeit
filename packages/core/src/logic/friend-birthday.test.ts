import { describe, expect, it } from "vitest";

import { ReminderIdSchema } from "../api/users/types";
import { friendReminderId, nearestFriendBirthday } from "./dates";

// День рождения друга на «Вишлисте» (auto-tasks P03).
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime();

const friend = (id: string, name: string, birthday?: string) => ({
  user: { id, name, ...(birthday ? { birthday } : {}) },
});

describe("nearestFriendBirthday", () => {
  const now = at(2026, 11, 28);

  it("окно 14 дней: через 14 — есть, через 15 и без даты — нет", () => {
    expect(
      nearestFriendBirthday([friend("u_a", "Нурай", "12-12")], [], now),
    ).toMatchObject({ friendId: "u_a", daysLeft: 14, date: "2026-12-12" });
    expect(
      nearestFriendBirthday(
        [friend("u_b", "Бакыт", "12-13"), friend("u_c", "Без даты")],
        [],
        now,
      ),
    ).toBeNull();
  });

  it("ближайший первым, остальные в окне — в «ещё N»; сегодня — 0 дней", () => {
    const result = nearestFriendBirthday(
      [
        friend("u_a", "Нурай", "12-03"),
        friend("u_b", "Данияр", "11-28"),
        friend("u_c", "Айгерим", "12-10"),
        friend("u_d", "Далеко", "03-14"),
      ],
      [],
      now,
    );
    expect(result).toMatchObject({ friendId: "u_b", daysLeft: 0, more: 2 });
  });

  it("«Скрыть» прячет до следующего года: через год друг снова в окне", () => {
    const id = friendReminderId("u_a", "2026-12-03");
    expect(id).toBe("friend:u_a:2026");
    expect(ReminderIdSchema.safeParse(id).success).toBe(true);
    const friends = [friend("u_a", "Нурай", "12-03")];
    expect(nearestFriendBirthday(friends, [id], now)).toBeNull();
    expect(
      nearestFriendBirthday(friends, [id], at(2027, 11, 28)),
    ).toMatchObject({ id: "friend:u_a:2027", daysLeft: 5 });
  });

  it("через Новый год: 25 декабря и день рождения 5 января — 11 дней", () => {
    expect(
      nearestFriendBirthday(
        [friend("u_a", "Нурай", "01-05")],
        [],
        at(2026, 12, 25),
      ),
    ).toMatchObject({
      date: "2027-01-05",
      daysLeft: 11,
      id: "friend:u_a:2027",
    });
  });

  it("29 февраля в невисокосный год — 28 февраля", () => {
    expect(
      nearestFriendBirthday(
        [friend("u_a", "Нурай", "02-29")],
        [],
        at(2027, 2, 20),
      ),
    ).toMatchObject({ date: "2027-02-28", daysLeft: 8 });
  });
});
