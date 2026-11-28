import { telegramClientId } from "@/shared/config";
import { setRemoteToken } from "@/shared/store";

import { isRemoteBuild } from "../remote-base";
import { getTransport } from "../transport";
import type {
  TelegramLoginInput,
  TelegramLoginResult,
  TelegramNonceResponse,
} from "./types";

// Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03): библиотека
// Telegram Login открывает окно oauth.telegram.org и возвращает id_token
// (OpenID Connect), сервер проверяет его подпись. Только remote и только
// при NEXT_PUBLIC_TELEGRAM_CLIENT_ID — иначе кнопок нет.

export const TELEGRAM_LOGIN_SCRIPT =
  "https://oauth.telegram.org/js/telegram-login.js";

// Права: profile (имя — только подсказка, сервер его не хранит) и
// telegram:bot_access — уведомления ботом, решение владельца (§14), чтобы
// потом не спрашивать второй раз. Телефон не просим.
export const TELEGRAM_SCOPE = ["profile", "telegram:bot_access"] as const;

export const isTelegramLoginEnabled = (): boolean =>
  isRemoteBuild() && telegramClientId() !== null;

// ── Сервер ──────────────────────────────────────────────────────────────

// quiet: 401 здесь — «токен Telegram не подошёл», а не «Сессия закончилась».
export const getTelegramNonce = (): Promise<TelegramNonceResponse> =>
  getTransport().request<TelegramNonceResponse>(
    "POST",
    "/auth/telegram/nonce",
    undefined,
    undefined,
    { quiet: true },
  );

// Новый токен сессии (вход в профиль Telegram или новый профиль) сохраняем
// сразу, как после POST /users.
export const loginTelegram = async (
  input: TelegramLoginInput,
): Promise<TelegramLoginResult> => {
  const result = await getTransport().request<TelegramLoginResult>(
    "POST",
    "/auth/telegram",
    input,
    undefined,
    { quiet: true },
  );
  if ("token" in result) setRemoteToken(result.token);
  return result;
};

// ── Окно Telegram ───────────────────────────────────────────────────────

type TelegramLoginOptions = {
  client_id: number;
  lang?: string;
  nonce?: string;
  scope?: readonly string[];
};

type TelegramLoginData = { error?: string; id_token?: string };

// Telegram.Login из telegram-login.js (core.telegram.org/bots/telegram-login).
export type TelegramLoginSdk = {
  auth: (
    options: TelegramLoginOptions,
    callback: (data: TelegramLoginData) => void,
  ) => void;
};

// Человек закрыл окно — не ошибка, тоста не нужно.
export class TelegramLoginCancelled extends Error {
  override name = "TelegramLoginCancelled";
}

const sdkOnPage = (): TelegramLoginSdk | undefined =>
  (window as { Telegram?: { Login?: TelegramLoginSdk } }).Telegram?.Login;

let loading: null | Promise<TelegramLoginSdk> = null;

// Скрипт Telegram — только там, где есть кнопка, и заранее: окно должно
// открыться прямо в нажатии, иначе браузер его заблокирует.
export const loadTelegramLogin = (): Promise<TelegramLoginSdk> => {
  const ready = sdkOnPage();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<TelegramLoginSdk>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TELEGRAM_LOGIN_SCRIPT;
    script.async = true;
    script.onload = () => {
      const sdk = sdkOnPage();
      if (sdk) resolve(sdk);
      else reject(new Error("telegram-login.js без Telegram.Login"));
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error("telegram-login.js не загрузился"));
    };
    document.head.append(script);
  });
  return loading;
};

// Уже загружен — чтобы открыть окно без ожидания.
export const loadedTelegramLogin = (): TelegramLoginSdk | undefined =>
  typeof window === "undefined" ? undefined : sdkOnPage();

// Открыть окно Telegram: id_token или TelegramLoginCancelled / Error.
export const askTelegramIdToken = (
  sdk: TelegramLoginSdk,
  clientId: string,
  nonce: string,
): Promise<string> =>
  new Promise((resolve, reject) => {
    sdk.auth(
      { client_id: Number(clientId), scope: TELEGRAM_SCOPE, nonce, lang: "ru" },
      (data) => {
        if (data?.id_token) resolve(data.id_token);
        else if (data?.error === "popup_closed") {
          reject(new TelegramLoginCancelled());
        } else reject(new Error(data?.error ?? "Telegram не ответил"));
      },
    );
  });
