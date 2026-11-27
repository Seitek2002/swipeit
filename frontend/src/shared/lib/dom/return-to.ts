// Куда вернуть человека после онбординга: открыл приглашение в план без
// профиля → познакомились → снова приглашение (TECH_SPEC §8). Живёт в
// sessionStorage вкладки; только свои пути — чужой адрес не подставить.
const KEY = "swipeit:returnTo";

export const setReturnTo = (path: string) => {
  try {
    sessionStorage.setItem(KEY, path);
  } catch {
    // Хранилище запрещено — вернётся на главный экран.
  }
};

export const takeReturnTo = (): null | string => {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return path?.startsWith("/") && !path.startsWith("//") ? path : null;
  } catch {
    return null;
  }
};
