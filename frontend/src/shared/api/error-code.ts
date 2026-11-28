// Код ошибки для человека (auto-tasks-pm-4 S08): первые 8 символов
// requestId сервера. Человек называет его владельцу («у меня сломалось, код
// a1b2c3d4»), а тот ищет полный requestId в логах и в «Последних сбоях»
// отчёта. Без Sentry это единственный след конкретного сбоя.
//
// Код едет в тексте ошибки — «… · код a1b2c3d4»: экраны показывают
// error.message как есть, и код доходит до любого тоста без правки экранов.
// Тост (shared/ui/toast) отрезает хвост и рисует код мелкой кнопкой
// «скопировать». Модуль без зависимостей: тост импортирует его напрямую, а
// не через тяжёлый barrel @/shared/api.

export const ERROR_CODE_LENGTH = 8;

const SUFFIX = " · код ";
const TAIL = new RegExp(`${SUFFIX}([0-9a-z]{${ERROR_CODE_LENGTH}})$`);

// requestId → код: первые 8 букв и цифр, строчными. Не похоже на id — null.
export const shortErrorCode = (requestId: unknown): null | string => {
  if (typeof requestId !== "string") return null;
  const code = requestId
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, ERROR_CODE_LENGTH);
  return code.length === ERROR_CODE_LENGTH ? code : null;
};

export const withErrorCode = (message: string, code: string) =>
  `${message}${SUFFIX}${code}`;

// Текст тоста → фраза и код (если есть).
export const splitErrorCode = (
  text: string,
): { code: null | string; text: string } => {
  const match = TAIL.exec(text);
  if (!match?.[1]) return { text, code: null };
  return { text: text.slice(0, match.index), code: match[1] };
};
