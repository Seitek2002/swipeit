import {
  SANTA_WISHES_ENOUGH,
  type SantaMember,
  memberWishlistStatus,
} from "@/entities/santa-game";

import { formatPrice, pluralize } from "@/shared/lib/format";

// Текст «Сообщить в чат» после жеребьёвки (auto-tasks-pm-2 Q06). Ссылку на
// игру добавляет кнопка отправки.
const MAX_NAMES = 5;

// С такой игры письмо сразу после жеребьёвки ещё не открыл никто — вместо
// «Азамат, Нурай, Данияр, Мээрим и ещё 25» зовём всех числом (ux-6).
const ALL_BY_COUNT_FROM = 8;

// «Нурай, Бакыт и ещё 4» — больше пяти имён не перечисляем.
export const namesLine = (names: readonly string[]): string => {
  if (names.length <= MAX_NAMES) return names.join(", ");
  return `${names.slice(0, MAX_NAMES - 1).join(", ")} и ещё ${names.length - (MAX_NAMES - 1)}`;
};

// opened и hasWishlist не приходят только гостю (S05) — у него этого экрана
// нет.
type LetterMember = { id: string; name: string; opened?: boolean };

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
  // Никто, кроме, может быть, отправителя, ещё не открыл — «все 30».
  if (
    members.length >= ALL_BY_COUNT_FROM &&
    waiting.length >= members.length - 1
  ) {
    return `Жеребьёвка в «${title}» прошла — все ${pluralize(members.length, ["участник", "участника", "участников"])}, откройте письмо и узнайте, кому дарите. ${terms}`;
  }
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

// «Напомнить про вишлист» (P08, Y07, Z03): вступившие, у кого вишлист не
// готов по правилу core — без вишлиста и с 1–2 желаниями в бюджете, — кроме
// того, кто нажимает: себя в чат не зовут (как X08 в «Сообщить в чат»), для
// себя есть «Собрать вишлист» в строке «Ты». Пусто — кнопки нет.
export const remindWishlistNames = (
  members: ReadonlyArray<
    Pick<
      SantaMember,
      "hasWishlist" | "id" | "joined" | "name" | "wishesInBudget"
    >
  >,
  senderId: string,
): string[] =>
  members
    .filter(
      (member) =>
        member.joined &&
        member.id !== senderId &&
        memberWishlistStatus(member) !== "ready",
    )
    .map((member) => member.name);

// Текст в чат: ссылку на игру добавляет кнопка отправки. Сколько и до какой
// цены — тот же порог, что у «вишлист готов».
export const remindWishlistText = (
  names: readonly string[],
  game: { budget: number; title: string },
) =>
  `${namesLine(names)} — соберите вишлист для Тайного Санты «${game.title}»: хотя бы ${pluralize(SANTA_WISHES_ENOUGH, ["желание", "желания", "желаний"])} до ${formatPrice(game.budget)}, так Санте будет проще выбрать подарок`;
