import type { SantaGame, UpdateSantaInput } from "../api/santa/types";
import { formatDayMonth } from "../format/dates";
import { formatPrice } from "../format/format-price";

// Правка игры Тайного Санты (R03) — общие правила мока и сервера: что можно
// менять после жеребьёвки и какой тост получают участники.

export const AFTER_DRAW_PATCH_MESSAGE =
  "Жеребьёвка уже прошла — менять можно только дату обмена";

// После жеребьёвки праздник могут перенести — дату обмена менять можно.
// Название, бюджет и исключения — нельзя: пары уже вытянуты под них,
// а Санта мог уже купить подарок в старый бюджет.
export const lockedAfterDraw = (patch: UpdateSantaInput): boolean =>
  Object.entries(patch).some(
    ([key, value]) => key !== "exchangeDate" && value !== undefined,
  );

type Terms = Pick<SantaGame, "budget" | "exchangeDate" | "title">;

// «Организатор изменил условия «Офис»: бюджет 3 000 сом, обмен 27 декабря»
// — участникам, когда поменялся бюджет или дата обмена. Название и
// исключения сами по себе не повод: на подарок они не влияют. null — тост
// не нужен.
export const termsChangedText = (before: Terms, after: Terms): null | string =>
  before.budget === after.budget && before.exchangeDate === after.exchangeDate
    ? null
    : `Организатор изменил условия «${after.title}»: бюджет ${formatPrice(after.budget)}, обмен ${formatDayMonth(after.exchangeDate)}`;
