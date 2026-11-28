import { WISHLIST_SENT_KEY } from "@/shared/store";

// Что лежит на устройстве мимо мок-сервера и должно уйти вместе с демо-данными
// (UX-аудит G10): диалог обещает пустой профиль, а следующий человек видел
// чужой фильтр «до 2 000 сом» и чужую букву в аватаре.
//   gift-filters — фильтры ленты (shared/store/filters);
//   guest — id и имя гостя по ссылке (shared/store/guest);
//   santa-nudge-intro — игры, где плашка Санты уже показала полный текст
//     (widgets/santa-nudge);
//   hints — «обучение пройдено» у гостя без профиля (features/deck-guide);
//   ownUserId — свой профиль до входа демо-пользователем (entities/user);
//   wishlist-sent — что было в вишлисте при отправке (G06).
// База (swipeit:db:v1) и настройки демо здесь не трогаются: базу сбрасывает
// сам сервер, а скорость ботов и задержки — настройки показа, не данные.
export const DEMO_DEVICE_KEYS = [
  "swipeit:gift-filters",
  "swipeit:guest",
  "swipeit:santa-nudge-intro",
  "swipeit:hints",
  "swipeit:ownUserId",
  WISHLIST_SENT_KEY,
] as const;

// Хранилище запрещено (приватный режим) — чистить нечего.
export const clearDemoDeviceState = (
  storage: Pick<Storage, "removeItem"> | undefined,
) => {
  if (!storage) return;
  for (const key of DEMO_DEVICE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Не вышло — останется прежним, как было до G10.
    }
  }
};
