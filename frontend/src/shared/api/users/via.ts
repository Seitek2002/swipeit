import type { ApiMode } from "../mode";
import type { NewUserInput } from "./types";

export type UserVia = NonNullable<NewUserInput["via"]>;

// Откуда профиль (Q01) — только для сервера remote: мок и LAN поле не читают,
// и в local/lan его не шлём вовсе. Явное значение экрана (бронь, приглашение)
// важнее запомненной ссылки; без того и другого профиль — «из ленты».
export const viaForNewUser = (
  mode: ApiMode,
  requested: undefined | UserVia,
  remembered: null | UserVia,
): undefined | UserVia => {
  if (mode !== "remote") return undefined;
  return requested ?? remembered ?? "feed";
};
