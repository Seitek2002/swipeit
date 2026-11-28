import type { NOTIFICATION_KINDS } from "../../db/schema";

// Тексты уведомлений ботом (auto-tasks-pm-4 S10). Сообщение видно на
// заблокированном экране, поэтому в нём только название игры или плана — ни
// имени подопечного, ни кто что купил или забронировал. Обычный текст, без
// разметки Telegram: названию экранирование не нужно.

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

const quoted = (title: string) => `„${title}“`;

export const NOTIFICATION_TEXTS = {
  santaDrawn: (title: string) =>
    `Тайный Санта ${quoted(title)}: жеребьёвка прошла. Открой письмо — там, кому ты даришь`,
  santaNewLetter: (title: string) =>
    `${quoted(title)}: у тебя новое письмо — открой его`,
  santaDrawFailed: (title: string) =>
    `${quoted(title)}: жеребьёвка по дате не прошла — загляни в игру`,
  santaDrawTomorrow: (title: string) =>
    `Завтра жеребьёвка в ${quoted(title)}. Добавь пару желаний — твоему Санте будет проще`,
  // days — 1…3: игру могли разыграть и за два дня до обмена.
  santaExchangeSoon: (title: string, days: number) =>
    `До обмена в ${quoted(title)} ${days} ${days === 1 ? "день" : "дня"}. Подарок уже есть? Отметь в игре или загляни в вишлист подопечного`,
  planResults: (title: string) =>
    `Итоги ${quoted(title)} готовы — смотри, куда хотят все`,
} as const;

// Кнопка в сообщении — игра или план (адрес фронта + путь, как ROUTES).
export const notificationLink = (
  kind: NotificationKind,
  refId: string,
  appUrl: string,
): { label: string; url: string } => {
  const id = encodeURIComponent(refId);
  return kind === "plan_results"
    ? { label: "Открыть план", url: `${appUrl}/plans/session/?id=${id}` }
    : { label: "Открыть игру", url: `${appUrl}/santa/game/?id=${id}` };
};
