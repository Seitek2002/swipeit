import { create } from "zustand";

// Сессия режима remote (BACKEND.md §3.2, §9.3). Токен — в localStorage под
// своим ключом, строкой как есть: все вкладки браузера — один человек, и
// другая вкладка узнаёт о выходе по событию storage с этим ключом.
export const REMOTE_TOKEN_KEY = "swipeit:remote:token";
// Последний пользователь — рядом с токеном (setLastUserKey в app/environment):
// новая вкладка открывается тем же профилем, а не берёт id из демо.
export const REMOTE_USER_KEY = "swipeit:remote:userId";

// Хранилище запрещено (приватный режим) — токен живёт до закрытия вкладки.
let memoryToken: null | string = null;

export const getRemoteToken = (): null | string => {
  try {
    return localStorage.getItem(REMOTE_TOKEN_KEY);
  } catch {
    return memoryToken;
  }
};

export const setRemoteToken = (token: null | string) => {
  memoryToken = token;
  try {
    if (token) localStorage.setItem(REMOTE_TOKEN_KEY, token);
    else localStorage.removeItem(REMOTE_TOKEN_KEY);
  } catch {
    // См. memoryToken.
  }
};

export const readRemoteUserId = (): null | string => {
  try {
    return localStorage.getItem(REMOTE_USER_KEY);
  } catch {
    return null;
  }
};

type RemoteSessionState = {
  // Сервер ответил 401 (или закрыл WebSocket с 4401): токен неверный или
  // сессия закрыта. Новый профиль поверх старого молча не создаём (§3.2) —
  // экран «Сессия закончилась» спрашивает человека.
  expired: boolean;
};

export const useRemoteSessionStore = create<RemoteSessionState>()(() => ({
  expired: false,
}));

export const markRemoteSessionExpired = () =>
  useRemoteSessionStore.setState({ expired: true });

// «Выйти», «Удалить профиль», «Начать заново»: токена нет — при следующем
// запуске вкладка тихо создаст новый анонимный профиль (§3.1).
export const clearRemoteSession = () => {
  setRemoteToken(null);
  try {
    localStorage.removeItem(REMOTE_USER_KEY);
  } catch {
    // Хранилище запрещено — помнить и нечего.
  }
  useRemoteSessionStore.setState({ expired: false });
};
