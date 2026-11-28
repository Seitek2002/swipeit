import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { telegramClientId } from "@/shared/config";
import {
  getRemoteToken,
  setRemoteToken,
  useRemoteSessionStore,
} from "@/shared/store";

import { remoteTransport } from "../remote-transport";
import { setTransport } from "../transport";
import {
  TelegramLoginCancelled,
  type TelegramLoginSdk,
  askTelegramIdToken,
  isTelegramLoginEnabled,
  loginTelegram,
} from "./telegram";

// Вход через Telegram (auto-tasks-pm-4 S03): кнопка есть только в remote и
// только с NEXT_PUBLIC_TELEGRAM_CLIENT_ID — TelegramLoginButton, профиль и
// «Сессия закончилась» спрашивают isTelegramLoginEnabled.
const env = process.env as Record<string, string | undefined>;
const saved = {
  api: env.NEXT_PUBLIC_API_URL,
  telegram: env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID,
};

const restore = (name: string, value: string | undefined) => {
  if (value === undefined) delete env[name];
  else env[name] = value;
};

afterEach(() => {
  restore("NEXT_PUBLIC_API_URL", saved.api);
  restore("NEXT_PUBLIC_TELEGRAM_CLIENT_ID", saved.telegram);
  vi.unstubAllGlobals();
});

describe("вход через Telegram: когда кнопка есть", () => {
  it("без NEXT_PUBLIC_TELEGRAM_CLIENT_ID кнопки нет — даже в remote", () => {
    env.NEXT_PUBLIC_API_URL = "http://api.test";
    delete env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID;
    expect(isTelegramLoginEnabled()).toBe(false);
    env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID = "  ";
    expect(isTelegramLoginEnabled()).toBe(false);
  });

  it("Client ID не число — как будто его нет", () => {
    env.NEXT_PUBLIC_API_URL = "http://api.test";
    env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID = "my-bot";
    expect(telegramClientId()).toBeNull();
    expect(isTelegramLoginEnabled()).toBe(false);
  });

  it("не remote (демо, LAN) — кнопки нет, даже с Client ID", () => {
    delete env.NEXT_PUBLIC_API_URL;
    env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID = "7000000001";
    expect(isTelegramLoginEnabled()).toBe(false);
  });

  it("remote и Client ID — кнопка есть", () => {
    env.NEXT_PUBLIC_API_URL = "http://api.test";
    env.NEXT_PUBLIC_TELEGRAM_CLIENT_ID = " 7000000001 ";
    expect(telegramClientId()).toBe("7000000001");
    expect(isTelegramLoginEnabled()).toBe(true);
  });
});

describe("окно Telegram", () => {
  const sdkReturning = (data: { error?: string; id_token?: string }) => {
    const auth = vi.fn<TelegramLoginSdk["auth"]>((_, callback) =>
      callback(data),
    );
    return { auth, sdk: { auth } satisfies TelegramLoginSdk };
  };

  it("просит profile и доступ бота, передаёт nonce, отдаёт id_token", async () => {
    const { auth, sdk } = sdkReturning({ id_token: "a.b.c" });
    await expect(askTelegramIdToken(sdk, "7000000001", "n1")).resolves.toBe(
      "a.b.c",
    );
    expect(auth.mock.calls[0]?.[0]).toEqual({
      client_id: 7000000001,
      scope: ["profile", "telegram:bot_access"],
      nonce: "n1",
      lang: "ru",
    });
  });

  it("закрытое окно — TelegramLoginCancelled (без тоста), другое — ошибка", async () => {
    await expect(
      askTelegramIdToken(sdkReturning({ error: "popup_closed" }).sdk, "1", "n"),
    ).rejects.toBeInstanceOf(TelegramLoginCancelled);
    await expect(
      askTelegramIdToken(sdkReturning({ error: "boom" }).sdk, "1", "n"),
    ).rejects.toThrow("boom");
  });
});

describe("POST /auth/telegram", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });

  beforeEach(() => {
    env.NEXT_PUBLIC_API_URL = "http://api.test";
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    setTransport(remoteTransport);
    setRemoteToken("old");
    useRemoteSessionStore.setState({ expired: false });
  });

  it("вход в профиль Telegram — новый токен сохранён сразу", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { status: "switched", me: { id: "u_1" }, token: "new" }),
    );
    const result = await loginTelegram({ idToken: "a.b.c" });
    expect(result.status).toBe("switched");
    expect(getRemoteToken()).toBe("new");
  });

  it("привязка — токен прежний", async () => {
    fetchMock.mockResolvedValueOnce(
      json(200, { status: "linked", me: { id: "u_1" } }),
    );
    await loginTelegram({ idToken: "a.b.c" });
    expect(getRemoteToken()).toBe("old");
  });

  it("401 от входа — не «Сессия закончилась»", async () => {
    fetchMock.mockResolvedValueOnce(
      json(401, { code: "UNAUTHORIZED", message: "Не получилось" }),
    );
    await expect(loginTelegram({ idToken: "x" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(useRemoteSessionStore.getState().expired).toBe(false);
    expect(getRemoteToken()).toBe("old");
  });
});
