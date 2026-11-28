import { type SantaMember, memberWishlistStatus } from "@/entities/santa-game";

import { formatPrice } from "@/shared/lib/format";

// Статус строки участника (DESIGN.md §8.8). После жеребьёвки в списке один
// вид статуса — письмо: «✓ вишлист готов» рядом с «письмо не открыто»
// читалось как «письмо не открывала, а вишлист собрала» (UX-аудит X08).
// Вишлист — только до жеребьёвки, по правилу core (Z03): 3 желания в
// бюджете — готов, вишлист есть, но в бюджете меньше — мало, вишлиста нет —
// без вишлиста (T28). Тот же статус — в подсказке «Собери вишлист» и в
// подтверждении жеребьёвки.
export type MemberStatus =
  // «Добавить желание» — у себя: вишлист есть, но всё дороже бюджета (T28).
  | "add-cheaper"
  // «Собрать вишлист» — кнопка в своей строке.
  | "collect"
  | "invited"
  | "letter-opened"
  | "letter-sealed"
  | "no-wishlist"
  | "wishlist-few"
  | "wishlist-ready";

type StatusMember = Pick<
  SantaMember,
  "hasWishlist" | "joined" | "opened" | "wishesInBudget"
>;

// Подсказка «Собери вишлист, чтобы твоему Санте было проще» в моей строке —
// до и после жеребьёвки: Санта выбирает подарок и после неё.
export const needsWishes = (member: StatusMember) =>
  member.joined && memberWishlistStatus(member) !== "ready";

// Вишлист есть, но в бюджете игры ни одного желания: «Собери вишлист» тут
// неправда — человеку нужны желания подешевле (T28).
const allOverBudget = (member: StatusMember) =>
  memberWishlistStatus(member) === "few" && (member.wishesInBudget ?? 0) === 0;

// Подсказка в моей строке (R06, Z03, T28); null — подсказки нет.
export const ownWishesHint = (
  member: StatusMember,
  budget: number,
): null | string => {
  if (!needsWishes(member)) return null;
  return allOverBudget(member)
    ? `Ничего в бюджете ${formatPrice(budget)} — добавь пару желаний подешевле`
    : "Собери вишлист, чтобы твоему Санте было проще";
};

export const memberStatus = (
  member: StatusMember,
  { drawn, isMe }: { drawn: boolean; isMe: boolean },
): MemberStatus => {
  if (!member.joined) return "invited";
  if (drawn) return member.opened ? "letter-opened" : "letter-sealed";
  const wishlist = memberWishlistStatus(member);
  if (isMe && wishlist !== "ready") {
    return allOverBudget(member) ? "add-cheaper" : "collect";
  }
  if (wishlist === "ready") return "wishlist-ready";
  return wishlist === "few" ? "wishlist-few" : "no-wishlist";
};
