import { describe, expect, it } from "vitest";

import { parseRemoteApiBase, remoteApiUrl, remoteWsUrl } from "./remote-base";

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
});
