// Текст «Сообщить в чат» после жеребьёвки (auto-tasks-pm-2 Q06). Ссылку на
// игру добавляет кнопка отправки.
const MAX_NAMES = 5;

// «Нурай, Бакыт и ещё 4» — больше пяти имён не перечисляем.
export const namesLine = (names: readonly string[]): string => {
  if (names.length <= MAX_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_NAMES - 1).join(", ")} и ещё ${names.length - (MAX_NAMES - 1)}`;
};

export const lettersMessage = ({
  title,
  terms,
  exchange,
  waiting,
}: {
  exchange: string;
  terms: string;
  title: string;
  // Имена тех, кто ещё не открыл письмо.
  waiting: readonly string[];
}): string =>
  waiting.length > 0
    ? `Жеребьёвка в «${title}» прошла: ${namesLine(waiting)} — откройте письмо и узнайте, кому дарите. ${terms}`
    : `Все открыли письма в «${title}». Обмен ${exchange} — не забудьте подарки!`;
