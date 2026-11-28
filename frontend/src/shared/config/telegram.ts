// Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03): Client ID бота
// из @BotFather → Login Widget. Он не секрет и вшивается в сборку web
// (NEXT_PUBLIC_TELEGRAM_CLIENT_ID). Нет переменной или она не число — кнопок
// входа нигде нет.
export const telegramClientId = (): null | string => {
  const raw = process.env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID?.trim();
  return raw && /^\d{1,20}$/.test(raw) ? raw : null;
};
