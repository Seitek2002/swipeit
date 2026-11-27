import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

// «Последний пользователь» устройства: новая вкладка начинает с него. В lan
// ключ свой у каждого сервера — swipeit:lan:<serverId>:userId (TECH_SPEC
// §7a), чтобы разные ноутбуки не путались.
let lastUserKey = "swipeit:lastUserId";

export const setLastUserKey = (key: string) => {
  lastUserKey = key;
};

type SessionState = {
  activeUserId: null | string;
  // remember: false — для «Смотреть как» (T12): подмена только в этой вкладке,
  // новая вкладка по-прежнему откроется под своим пользователем.
  setActiveUser: (
    userId: null | string,
    options?: { remember?: boolean },
  ) => void;
};

const readLastUser = (): null | string => {
  try {
    return localStorage.getItem(lastUserKey);
  } catch {
    return null;
  }
};

// Сессия вкладки (TECH_SPEC §7 «Сессия вкладки»): активный пользователь — в
// sessionStorage, у каждой вкладки свой. Так две вкладки — два участника.
export const useSessionStore = create<SessionState>()(
  persist(
    (set) => ({
      activeUserId: null,
      setActiveUser: (userId, { remember = true } = {}) => {
        set({ activeUserId: userId });
        if (!remember) return;
        try {
          if (userId) localStorage.setItem(lastUserKey, userId);
          else localStorage.removeItem(lastUserKey);
        } catch {
          // Хранилище запрещено (приватный режим) — сессия живёт в памяти.
        }
      },
    }),
    {
      name: "swipeit:session",
      storage: createJSONStorage(() => sessionStorage),
      // Сессию читаем после определения режима (app/environment.ts): в lan
      // «последний пользователь» лежит под ключом сервера.
      skipHydration: true,
      onRehydrateStorage: () => (state) => {
        if (state && !state.activeUserId) {
          const last = readLastUser();
          if (last) state.setActiveUser(last, { remember: false });
        }
      },
    },
  ),
);

// Для транспорта и обработчиков вне React — императивно (как в imbir).
export const getActiveUserId = () => useSessionStore.getState().activeUserId;
