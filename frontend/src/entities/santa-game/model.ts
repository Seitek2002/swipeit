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

// Подпись под запечатанным конвертом (DESIGN.md §7 SantaEnvelope).
export const drawLabel = (game: SantaView["game"]) =>
  game.drawAt
    ? `Жеребьёвка ${formatDayMonth(game.drawAt)}`
    : "Жеребьёвка — когда все соберутся";
