// Встроенный браузер мессенджера (auto-tasks-pm-2 Q08): у него своё
// хранилище — бронь и свой вишлист гостя останутся только там, а поставить
// приложение оттуда нельзя. Узнаём по известным меткам User-Agent; не узнали
// — null: лучше промолчать, чем ошибиться. Telegram на iOS открывает
// ссылки в Safari View с обычным UA — его не узнать, и он не нужен.
export type InAppBrowser = "facebook" | "instagram" | "telegram";

export const detectInAppBrowser = (userAgent: string): InAppBrowser | null => {
  if (/Telegram-Android|TelegramBot-like|\bTelegram\b/i.test(userAgent)) {
    return "telegram";
  }
  if (/\bInstagram\b/.test(userAgent)) return "instagram";
  if (/\bFBA[NV]\//.test(userAgent)) return "facebook";
  return null;
};

export const IN_APP_BROWSER_NAMES: Record<InAppBrowser, string> = {
  telegram: "Telegram",
  instagram: "Instagram",
  facebook: "Facebook",
};
