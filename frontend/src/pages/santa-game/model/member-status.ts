import type { SantaMember } from "@/entities/santa-game";

// Статус строки участника (DESIGN.md §8.8). После жеребьёвки в списке один
// вид статуса — письмо: «✓ вишлист готов» рядом с «письмо не открыто»
// читалось как «письмо не открывала, а вишлист собрала» (UX-аудит X08).
// Вишлист — только до жеребьёвки.
export type MemberStatus =
  // «Собрать вишлист» — кнопка в своей строке.
  | "collect"
  | "invited"
  | "letter-opened"
  | "letter-sealed"
  | "no-wishlist"
  | "wishlist-ready";

export const memberStatus = (
  member: Pick<SantaMember, "hasWishlist" | "joined" | "opened">,
  {
    drawn,
    isMe,
    needWishes,
  }: {
    drawn: boolean;
    isMe: boolean;
    // Мне мало желаний в бюджете этой игры (R06).
    needWishes: boolean;
  },
): MemberStatus => {
  if (!member.joined) return "invited";
  if (drawn) return member.opened ? "letter-opened" : "letter-sealed";
  if (isMe && (needWishes || !member.hasWishlist)) return "collect";
  return member.hasWishlist ? "wishlist-ready" : "no-wishlist";
};
