import {
  MIN_SANTA_PARTICIPANTS,
  type SantaMember,
  type SantaSummary,
  type SantaView,
  type SantaWardItem,
  drawIssueWithInvites,
} from "@/shared/api";
import { formatDayMonth, formatPrice } from "@/shared/lib/format";

import { DRAW_FAILED_STATUS, drawFailedNow } from "./draw-failed";

export type { SantaMember, SantaSummary, SantaView, SantaWardItem };

// «Бюджет до 2 000 сом. Обмен подарками 27 декабря.» (reference.html).
export const santaTerms = (game: SantaView["game"]) =>
  `Бюджет до ${formatPrice(game.budget)}. Обмен подарками ${formatDayMonth(game.exchangeDate)}.`;

export const ALL_IN = "Все в сборе — можно тянуть пары";

// То же у участника и позванного: тянуть пары — не им.
export const ALL_IN_WAIT = "Все в сборе — ждём жеребьёвки";

type GatheringView = Pick<SantaView, "drawIssue" | "members" | "role"> & {
  game: Pick<SantaView["game"], "invitedIds" | "participantIds">;
};

// Почему тянуть пары ещё нельзя — глазами смотрящего. Организатору —
// drawIssue сервера. Остальным его не присылают (S05: в нём имена из
// исключений) — только то, что видно по составу: «Ждём, пока вступят:
// Нурай» или «Нужно хотя бы 3 участника…»; исключения — забота
// организатора. null — причины нет.
export const gatheringIssue = (view: GatheringView): null | string => {
  if (view.role === "owner") return view.drawIssue;
  const names = new Map(view.members.map((member) => [member.id, member.name]));
  return drawIssueWithInvites(
    view.game.participantIds,
    view.game.invitedIds,
    [],
    undefined,
    (id) => names.get(id) || "кто-то",
  );
};

// Состояние сбора одной строкой — одинаково под конвертом и в списке игр
// (UX-аудит W09): причина, по которой тянуть пары ещё нельзя («Ждём, пока
// вступят: Нурай», «Нужно хотя бы 3 участника…»), иначе — «Все в сборе».
export const gatheringStatus = (view: GatheringView) =>
  gatheringIssue(view) ?? (view.role === "owner" ? ALL_IN : ALL_IN_WAIT);

// Подпись под запечатанным конвертом (DESIGN.md §7 SantaEnvelope): дата
// жеребьёвки, если она назначена, иначе — состояние сбора. Жеребьёвка по
// дате не прошла (Y09) — так и пишем: прошедшая дата крупно сбивала с толку.
export const drawLabel = (
  view: GatheringView &
    Pick<SantaView, "game"> &
    Partial<Pick<SantaView, "drawFailed">>,
) => {
  if (drawFailedNow({ drawFailed: view.drawFailed, game: view.game })) {
    return DRAW_FAILED_STATUS;
  }
  return view.game.drawAt
    ? `Жеребьёвка ${formatDayMonth(view.game.drawAt)}`
    : gatheringStatus(view);
};

// Текст приглашения в игру — «Позвать по ссылке» и «Позвать друзей» (Y06).
export const santaInviteText = (game: SantaView["game"]) =>
  `Тайный Санта «${game.title}»: ${santaTerms(game)} Вступай!`;

// Вступивших меньше трёх (Y06): тянуть пары рано — главное действие
// «Позвать друзей», а не выключенная «Провести жеребьёвку».
export const needsMoreMembers = (
  view: Pick<SantaView, "game" | "members" | "role">,
) =>
  view.game.status === "gathering" &&
  (view.role === "owner" || view.role === "participant") &&
  view.members.filter((member) => member.joined).length <
    MIN_SANTA_PARTICIPANTS;
