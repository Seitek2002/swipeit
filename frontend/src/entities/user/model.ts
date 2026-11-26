// Типы пользователя объявлены один раз — контрактом API в shared/api (их же
// проверяет мок-сервер, которому нельзя импортировать entities по FSD) — и
// реэкспортируются отсюда для слоёв выше.
export type {
  BotProfile,
  FriendSummary,
  NewUserInput,
  UpdateMeInput,
  User,
} from "@/shared/api";
export type { AvatarColor } from "@/shared/config";
