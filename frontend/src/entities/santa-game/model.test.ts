import { describe, expect, it } from "vitest";

import {
  ALL_IN,
  ALL_IN_WAIT,
  drawLabel,
  gatheringIssue,
  gatheringStatus,
  ownerName,
  santaInviteText,
} from "./model";

type LabelView = Parameters<typeof drawLabel>[0];

const game = {
  drawAt: undefined,
  participantIds: ["u_me", "u_azamat", "u_nurai"],
  invitedIds: [],
} as unknown as LabelView["game"];

const members = [
  { id: "u_me", name: "Айгерим", joined: true },
  { id: "u_azamat", name: "Азамат", joined: true },
  { id: "u_nurai", name: "Нурай", joined: true },
] as LabelView["members"];

const owner = { drawIssue: null, game, members, role: "owner" } as const;

describe("строка сбора Санты (W09)", () => {
  it("нечего ждать — «Все в сборе», и под конвертом, и в списке", () => {
    expect(gatheringStatus(owner)).toBe(ALL_IN);
    expect(drawLabel(owner)).toBe(ALL_IN);
  });

  it("ждём или мало людей — причина одной строкой, без «когда все соберутся»", () => {
    const view = { ...owner, drawIssue: "Ждём, пока вступят: Нурай" };
    expect(drawLabel(view)).toBe("Ждём, пока вступят: Нурай");
    expect(gatheringStatus(view)).toBe("Ждём, пока вступят: Нурай");
  });

  it("назначена дата — под конвертом дата", () => {
    const dated = { ...game, drawAt: "2026-12-20T14:00:00.000Z" };
    expect(drawLabel({ ...owner, game: dated })).toMatch(
      /^Жеребьёвка 20\sдекабря/,
    );
  });

  it("жеребьёвка по дате не прошла — крупно об этом, а не прошедшая дата (Y09)", () => {
    const dated = {
      ...game,
      status: "gathering",
      drawAt: "2026-12-05T06:00:00.000Z",
    } as typeof game;
    const drawFailed = {
      at: "2026-12-05T06:00:00.000Z",
      reason: "Нужно хотя бы 3 участника — позови ещё друзей",
    };
    expect(drawLabel({ ...owner, game: dated, drawFailed })).toBe(
      "Жеребьёвка не прошла",
    );
    expect(drawLabel({ ...owner, game: dated, drawFailed: null })).toMatch(
      /^Жеребьёвка 5\sдекабря/,
    );
  });
});

// S05: drawIssue приходит только организатору — участник и позванный
// видят причину по составу игры, без исключений.
describe("строка сбора у участника (S05)", () => {
  const participant = { ...owner, role: "participant" } as const;

  it("все в сборе — ждём жеребьёвки, не «можно тянуть пары»", () => {
    expect(gatheringIssue(participant)).toBeNull();
    expect(gatheringStatus(participant)).toBe(ALL_IN_WAIT);
    expect(gatheringStatus({ ...participant, role: "invited" })).toBe(
      ALL_IN_WAIT,
    );
  });

  it("вступивших меньше трёх — ждём позванных по именам или зовём друзей", () => {
    const waiting = {
      ...participant,
      game: {
        ...game,
        participantIds: ["u_me", "u_azamat"],
        invitedIds: ["u_nurai"],
      },
    };
    expect(gatheringStatus(waiting)).toBe("Ждём, пока вступят: Нурай");
    const few = {
      ...participant,
      game: { ...game, participantIds: ["u_me", "u_azamat"] },
    };
    expect(gatheringStatus(few)).toBe(
      "Нужно хотя бы 3 участника — позови ещё друзей",
    );
  });

  it("drawIssue от сервера у участника не читаем", () => {
    const leaked = { ...participant, drawIssue: "Азамату некому дарить" };
    expect(gatheringIssue(leaked)).toBeNull();
  });
});

describe("текст приглашения в Санту (Z04)", () => {
  const plain = (text: string) => text.replace(/ /g, " ");
  // Локальное время — тест не зависит от часового пояса машины.
  const drawAt = new Date(2026, 11, 5, 16, 36).toISOString();
  const now = new Date(2026, 10, 28, 12, 0).getTime();
  const base = { title: "Офис 2026", budget: 1500, exchangeDate: "2026-12-12" };

  it("«По дате» — до когда вступить, бюджет со строчной", () => {
    expect(plain(santaInviteText({ ...base, drawAt }, now))).toBe(
      "Тайный Санта «Офис 2026»: бюджет до 1 500 сом, обмен 12 декабря. Вступай до 5 декабря, 16:36 — потом жеребьёвка",
    );
  });

  it("«Когда все соберутся» и прошедшая дата жеребьёвки — без срока", () => {
    const expected =
      "Тайный Санта «Офис 2026»: бюджет до 1 500 сом, обмен 12 декабря. Вступай!";
    expect(plain(santaInviteText(base, now))).toBe(expected);
    const later = new Date(2026, 11, 6).getTime();
    expect(plain(santaInviteText({ ...base, drawAt }, later))).toBe(expected);
  });
});

describe("имя организатора (Z02)", () => {
  it("по ownerId, после передачи роли — новый", () => {
    expect(ownerName({ members, game: { ownerId: "u_me" } })).toBe("Айгерим");
    expect(ownerName({ members, game: { ownerId: "u_nurai" } })).toBe("Нурай");
    expect(ownerName({ members, game: { ownerId: "u_gone" } })).toBeUndefined();
  });
});
