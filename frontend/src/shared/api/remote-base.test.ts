import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SAME_ORIGIN,
  parseRemoteApiBase,
  remoteApiUrl,
  remoteWsUrl,
} from "./remote-base";

describe("parseRemoteApiBase", () => {
  it("без переменной — не remote", () => {
    expect(parseRemoteApiBase(undefined)).toBeNull();
    expect(parseRemoteApiBase("")).toBeNull();
    expect(parseRemoteApiBase("   ")).toBeNull();
  });

  it("адрес с /v1 и без — одно и то же", () => {
    expect(parseRemoteApiBase("http://localhost:4100")).toBe(
      "http://localhost:4100",
    );
    expect(parseRemoteApiBase("http://localhost:4100/")).toBe(
      "http://localhost:4100",
    );
    expect(parseRemoteApiBase("https://api.example.kg/v1")).toBe(
      "https://api.example.kg",
    );
    expect(parseRemoteApiBase("https://api.example.kg/v1/")).toBe(
      "https://api.example.kg",
    );
  });

  it("сервер в подпапке сохраняет путь", () => {
    expect(parseRemoteApiBase("https://example.kg/swipeit/v1")).toBe(
      "https://example.kg/swipeit",
    );
  });

  it("same-origin — адрес страницы, без пути и /v1 (S02)", () => {
    expect(parseRemoteApiBase(SAME_ORIGIN, "https://swipeit.example.kg")).toBe(
      "https://swipeit.example.kg",
    );
    expect(parseRemoteApiBase(" same-origin ", "http://192.168.1.5:8080")).toBe(
      "http://192.168.1.5:8080",
    );
    // Без адреса страницы (сборка, не браузер) — ошибка, а не чужой адрес.
    expect(() => parseRemoteApiBase(SAME_ORIGIN)).toThrow(/same-origin/);
  });

  it("опечатка — ошибка, а не тихий уход в демо", () => {
    expect(() => parseRemoteApiBase("localhost:4100")).toThrow();
    expect(() => parseRemoteApiBase("ftp://example.kg")).toThrow();
    expect(() => parseRemoteApiBase("не адрес")).toThrow();
  });
});

describe("адреса remote", () => {
  it("REST — под /v1, WebSocket — ws(s)://…/v1/ws", () => {
    expect(remoteApiUrl("http://localhost:4100", "/me")).toBe(
      "http://localhost:4100/v1/me",
    );
    expect(remoteWsUrl("http://localhost:4100")).toBe(
      "ws://localhost:4100/v1/ws",
    );
    expect(remoteWsUrl("https://api.example.kg")).toBe(
      "wss://api.example.kg/v1/ws",
    );
  });

  it("same-origin: REST и WebSocket — на хосте страницы", () => {
    const base = parseRemoteApiBase(SAME_ORIGIN, "https://swipeit.example.kg");
    expect(base).not.toBeNull();
    expect(remoteApiUrl(base ?? "", "/me")).toBe(
      "https://swipeit.example.kg/v1/me",
    );
    expect(remoteWsUrl(base ?? "")).toBe("wss://swipeit.example.kg/v1/ws");
    const local = parseRemoteApiBase(SAME_ORIGIN, "http://localhost:8080");
    expect(remoteWsUrl(local ?? "")).toBe("ws://localhost:8080/v1/ws");
  });
});

describe("getRemoteApiBase", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const load = async (apiUrl: string) => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_API_URL", apiUrl);
    return import("./remote-base");
  };

  it("same-origin в браузере — адрес вкладки", async () => {
    vi.stubGlobal("window", {
      location: { origin: "https://swipeit.example.kg" },
    });
    const remote = await load("same-origin");
    expect(remote.isRemoteBuild()).toBe(true);
    expect(remote.getRemoteApiBase()).toBe("https://swipeit.example.kg");
  });

  it("same-origin при сборке страниц (без window) — пока без адреса", async () => {
    const remote = await load("same-origin");
    expect(remote.isRemoteBuild()).toBe(true);
    expect(remote.getRemoteApiBase()).toBeNull();
  });

  it("обычный адрес — как раньше", async () => {
    const remote = await load("http://localhost:4100/v1");
    expect(remote.getRemoteApiBase()).toBe("http://localhost:4100");
  });
});
