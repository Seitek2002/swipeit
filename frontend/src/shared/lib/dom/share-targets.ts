import { BASE_PATH } from "../base-path";

// Куда отправлять ссылки (TECH_SPEC §8 «Куда отправлять»). В Кыргызстане
// вишлистом делятся в основном через WhatsApp и Telegram — они первые.

// Адрес для чужих устройств в режиме «Локальная сеть» (из /api/health). На
// самом ноутбуке страница открыта по localhost — такая ссылка на телефоне
// не откроется, поэтому ссылки и QR оттуда строятся с адресом в Wi-Fi.
let shareOrigin: null | string = null;

export const setShareOrigin = (origin: null | string) => {
  shareOrigin = origin;
};

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Абсолютный адрес: origin + basePath + относительный путь из API.
export const absoluteUrl = (path: string) => {
  const origin =
    shareOrigin && LOOPBACK.has(window.location.hostname)
      ? shareOrigin
      : window.location.origin;
  return `${origin}${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
};

// Системное «Поделиться» есть только в безопасном контексте (HTTPS или
// localhost). На http-адресе локальной сети его нет — кнопку прячем (§7a).
export const canNativeShare = () =>
  typeof navigator !== "undefined" &&
  typeof navigator.share === "function" &&
  window.isSecureContext;

export type SharePayload = { text: string; title: string; url: string };

// false — человек закрыл системное окно сам, это не ошибка.
export const shareNative = async (payload: SharePayload): Promise<boolean> => {
  try {
    await navigator.share(payload);
    return true;
  } catch {
    return false;
  }
};

export const telegramUrl = ({ url, text }: SharePayload) =>
  `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

export const whatsappUrl = ({ url, text }: SharePayload) =>
  `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;

// Запасной путь без Clipboard API: на http-адресе локальной сети
// navigator.clipboard нет (TECH_SPEC §7a — обязателен).
const copyWithTextarea = (text: string) => {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  textarea.remove();
  return ok;
};

export const copyText = async (text: string): Promise<boolean> => {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Браузер запретил — пробуем запасной путь.
  }
  try {
    return copyWithTextarea(text);
  } catch {
    return false;
  }
};
