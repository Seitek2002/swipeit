// Текст «Сообщить в чат» после жеребьёвки (auto-tasks-pm-2 Q06). Ссылку на
// игру добавляет кнопка отправки.
const MAX_NAMES = 5;

// «Нурай, Бакыт и ещё 4» — больше пяти имён не перечисляем.
export const namesLine = (names: readonly string[]): string => {
  if (names.length <= MAX_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_NAMES - 1).join(", ")} и ещё ${names.length - (MAX_NAMES - 1)}`;
};

type LetterMember = { id: string; name: string; opened: boolean };

export const lettersMessage = ({
  title,
  terms,
  exchange,
  members,
  senderId,
}: {
  exchange: string;
  // Вступившие в игру: у них есть письмо.
  members: readonly LetterMember[];
  // Кто отправит текст: себя он в чат не зовёт (UX-аудит X08).
  senderId: string;
  terms: string;
  title: string;
}): string => {
  const sealed = members.filter((member) => !member.opened);
  const waiting = sealed
    .filter((member) => member.id !== senderId)
    .map((member) => member.name);
  if (waiting.length > 0) {
    return `Жеребьёвка в «${title}» прошла: ${namesLine(waiting)} — откройте письмо и узнайте, кому дарите. ${terms}`;
  }
  // Не открыл только сам отправитель — зовём всех, без имён: «все открыли»
  // было бы неправдой.
  if (sealed.length > 0) {
    return `Жеребьёвка в «${title}» прошла — откройте письмо и узнайте, кому дарите. ${terms}`;
  }
  return `Все открыли письма в «${title}». Обмен ${exchange} — не забудьте подарки!`;
};
