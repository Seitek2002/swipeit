// Номер сборки фронта (BACKEND.md §4.5, B17): уходит в заголовке
// x-client-build и сравнивается с minClientBuild из /v1/health. Номер задаёт
// CI (NEXT_PUBLIC_CLIENT_BUILD); без него — dev.
export const CLIENT_BUILD = process.env.NEXT_PUBLIC_CLIENT_BUILD ?? "dev";

const DIGITS = /^\d+$/;

// Сборка старее минимальной — экран «Вышла новая версия».
//
// Правило сравнения простое и одно на всё:
//   - оба номера из цифр («41», «117») — сравниваем как числа: иначе «9»
//     оказалось бы новее «10»;
//   - иначе — как строки (подходит для «2026-11-28.3»: дата с номером за
//     день сравнивается правильно, пока номер за день однозначный);
//   - «dev» (локальная сборка без номера) и пустой minClientBuild никогда
//     не устаревают: разработчика не выгоняем, а «0» на сервере значит
//     «пускать всех».
export const isClientOutdated = (
  client: string,
  min: null | string | undefined,
): boolean => {
  const required = min?.trim() ?? "";
  if (!required || required === "0" || client === "dev" || !client) {
    return false;
  }
  if (DIGITS.test(client) && DIGITS.test(required)) {
    return Number(client) < Number(required);
  }
  return client < required;
};
