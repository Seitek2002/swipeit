import type { ApiMode } from "../contract";

// Флаги функций, которые выкатываем в main до готовности (решение владельца
// 28.11: вместо отдельной ветки). Здесь — имена переменных и правило «что по
// умолчанию»; читают окружение сами фронт (config) и сервер (config.ts).
// С выключенным флагом всё выглядит и работает как раньше.

// Несколько вишлистов (spec-multi-wishlists). Фронт: в демо (local, lan)
// включено, в remote — только со значением «1». Next подставляет
// NEXT_PUBLIC_* при сборке лишь по буквальному process.env.<ИМЯ>, поэтому
// фронт пишет имя целиком, а эта константа — для документации и тестов.
export const MULTI_WISHLISTS_CLIENT_ENV = "NEXT_PUBLIC_MULTI_WISHLISTS";
// Сервер: выключено при NODE_ENV=production, в dev и тестах включено. С
// выключенным сервер не создаёт второй вишлист (multiWishlistsOff), но
// миграция и «Общий» действуют.
export const MULTI_WISHLISTS_SERVER_ENV = "FEATURE_MULTI_WISHLISTS";

// «1», «true», «on», «yes» — да; «0», «false», «off», «no» — нет; пусто и
// прочее — не задано (берём умолчание).
export const parseFeatureFlag = (
  value: string | undefined,
): boolean | undefined => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "on", "true", "yes"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
};

export const multiWishlistsOnClient = (
  mode: ApiMode,
  value: string | undefined,
): boolean => parseFeatureFlag(value) ?? mode !== "remote";

export const multiWishlistsOnServer = (
  nodeEnv: string | undefined,
  value: string | undefined,
): boolean => parseFeatureFlag(value) ?? nodeEnv !== "production";
