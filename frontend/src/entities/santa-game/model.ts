import type {
  SantaMember,
  SantaSummary,
  SantaView,
  SantaWardItem,
} from "@/shared/api";
import { formatDayMonth, formatPrice } from "@/shared/lib/format";

export type { SantaMember, SantaSummary, SantaView, SantaWardItem };

// «Бюджет до 2 000 сом. Обмен подарками 27 декабря.» (reference.html).
export const santaTerms = (game: SantaView["game"]) =>
  `Бюджет до ${formatPrice(game.budget)}. Обмен подарками ${formatDayMonth(game.exchangeDate)}.`;

export const ALL_IN = "Все в сборе — можно тянуть пары";

// Состояние сбора одной строкой — одинаково под конвертом и в списке игр
// (UX-аудит W09): причина, по которой тянуть пары ещё нельзя («Ждём, пока
// вступят: Нурай», «Нужно хотя бы 3 участника…»), иначе — «Все в сборе».
export const gatheringStatus = (view: Pick<SantaView, "drawIssue">) =>
  view.drawIssue ?? ALL_IN;

// Подпись под запечатанным конвертом (DESIGN.md §7 SantaEnvelope): дата
// жеребьёвки, если она назначена, иначе — состояние сбора.
export const drawLabel = (view: Pick<SantaView, "drawIssue" | "game">) =>
  view.game.drawAt
    ? `Жеребьёвка ${formatDayMonth(view.game.drawAt)}`
    : gatheringStatus(view);
