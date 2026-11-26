// 8 «тканевых» фонов аватара (DESIGN.md §7 Avatar, TECH_SPEC §5 AvatarColor).
// Справочник лежит в shared, а не в entities/user: им пользуется Avatar из
// shared/ui, а shared не может импортировать слои выше. entities/user
// реэкспортирует тип.
export const AVATAR_COLORS = [
  "plum",
  "mandarin",
  "mint",
  "champagne",
  "rose",
  "pomegranate",
  "graphite",
  "olive",
] as const;

export type AvatarColor = (typeof AVATAR_COLORS)[number];
