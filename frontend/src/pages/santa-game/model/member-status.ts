import { type SantaMember, memberWishlistStatus } from "@/entities/santa-game";

// Статус строки участника (DESIGN.md §8.8). После жеребьёвки в списке один
// вид статуса — письмо: «✓ вишлист готов» рядом с «письмо не открыто»
// читалось как «письмо не открывала, а вишлист собрала» (UX-аудит X08).
// Вишлист — только до жеребьёвки, по правилу core (Z03): 3 желания в
// бюджете — готов, 1–2 — мало, 0 — без вишлиста. Тот же статус — в
// подсказке «Собери вишлист» и в подтверждении жеребьёвки.
export type MemberStatus =
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

export const memberStatus = (
  member: StatusMember,
  { drawn, isMe }: { drawn: boolean; isMe: boolean },
): MemberStatus => {
  if (!member.joined) return "invited";
  if (drawn) return member.opened ? "letter-opened" : "letter-sealed";
  const wishlist = memberWishlistStatus(member);
  if (isMe && wishlist !== "ready") return "collect";
  if (wishlist === "ready") return "wishlist-ready";
  return wishlist === "few" ? "wishlist-few" : "no-wishlist";
};
