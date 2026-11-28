import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getRemoteToken,
  setRemoteToken,
  useRemoteSessionStore,
} from "@/shared/store";

import { remoteTransport } from "./remote-transport";

// Адрес читается лениво, при первом запросе.
process.env.NEXT_PUBLIC_API_URL = "http://api.test/v1";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setRemoteToken(null);
  useRemoteSessionStore.setState({ expired: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remoteTransport", () => {
  it("адрес под /v1, токен — в Authorization, сборка — в x-client-build", async () => {
    setRemoteToken("tok");
    fetchMock.mockResolvedValueOnce(json(200, { id: "u_1" }));
    await remoteTransport.request("GET", "/catalog/feed", undefined, {
      context: "self",
      limit: 5,
      exclude: undefined,
    });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/v1/catalog/feed?context=self&limit=5");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["x-client-build"]).toBeTruthy();
  });

  it("без токена — без Authorization (первый POST /users)", async () => {
    fetchMock.mockResolvedValueOnce(json(200, { me: {}, token: "t" }));
    await remoteTransport.request("POST", "/users", {});
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers.authorization).toBeUndefined();
    expect(headers["content-type"]).toBe("application/json");
    expect(getRemoteToken()).toBeNull();
  });

  it("обрыв на GET — один повтор", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(json(200, { ok: true }));
    await expect(remoteTransport.request("GET", "/me")).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("обрыв на POST — без повтора, OFFLINE", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      remoteTransport.request("POST", "/swipes", { productId: "p" }),
    ).rejects.toMatchObject({ code: "OFFLINE", status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("ошибка сервера → ApiError с его кодом и текстом", async () => {
    fetchMock.mockResolvedValueOnce(
      json(404, { code: "NOT_FOUND", message: "Нет такого", requestId: "r" }),
    );
    await expect(
      remoteTransport.request("GET", "/users/x"),
    ).rejects.toMatchObject({
      name: "ApiError",
      code: "NOT_FOUND",
      status: 404,
      message: "Нет такого",
    });
    expect(useRemoteSessionStore.getState().expired).toBe(false);
  });

  it("401 → «Сессия закончилась»", async () => {
    setRemoteToken("old");
    fetchMock.mockResolvedValueOnce(
      json(401, { code: "UNAUTHORIZED", message: "Сессия закончилась" }),
    );
    await expect(remoteTransport.request("GET", "/me")).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
    expect(useRemoteSessionStore.getState().expired).toBe(true);
  });

  it("200 не JSON (прокси, HTML) — сбой связи", async () => {
    fetchMock.mockResolvedValueOnce(new Response("<html>", { status: 200 }));
    await expect(remoteTransport.request("GET", "/me")).rejects.toMatchObject({
      code: "OFFLINE",
    });
  });
});
