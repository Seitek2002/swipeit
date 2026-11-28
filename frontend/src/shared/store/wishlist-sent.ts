import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const WISHLIST_SENT_KEY = "swipeit:wishlist-sent";

type WishlistSentState = {
  // userId → отпечаток вишлиста в момент последней отправки (G06): какие
  // желания были в «Хочу». Сам отпечаток считает фича отправки.
  byUser: Record<string, string>;
  remember: (userId: string, signature: string) => void;
};

// Что было в вишлисте, когда его отправили в последний раз (UX-аудит G06):
// пока ничего не поменялось, напоминание «отправь друзьям» не нужно, а после
// изменений в демо старая ссылка-снимок устарела. Хранится на устройстве:
// отправку с другого телефона экран не узнает — тогда напоминание как раньше.
export const useWishlistSentStore = create<WishlistSentState>()(
  persist(
    (set) => ({
      byUser: {},
      remember: (userId, signature) =>
        set((state) => ({ byUser: { ...state.byUser, [userId]: signature } })),
    }),
    {
      name: WISHLIST_SENT_KEY,
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
