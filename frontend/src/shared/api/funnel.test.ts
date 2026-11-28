import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiMode } from "./mode";

// Режим подменяем: настоящий определяется один раз на вкладку.
const mode = vi.hoisted(() => ({ current: "local" as ApiMode }));
vi.mock("./mode", () => ({ getMode: () => mode.current }));

// Модули — заново на каждый тест: «уже отправлено» живёт до перезагрузки.
const load = async () => {
  vi.resetModules();
  const funnel = await import("./funnel");
  const transport = await import("./transport");
  const store = await import("@/shared/store");
  const request = vi.fn();
  transport.setTransport({ request });
  return { ...funnel, ...store, request };
};

// Дать отработать отклонённому промису: необработанный отказ уронил бы тест.
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  mode.current = "local";
});

describe("trackStep (auto-tasks-pm-3 R09)", () => {
  it("local и lan — транспорт не трогает", async () => {
    const { request, setRemoteToken, trackStep } = await load();
    setRemoteToken("tok");
    trackStep("share_channel_copy");
    mode.current = "lan";
    trackStep("share_channel_qr");
    expect(request).not.toHaveBeenCalled();
  });

  it("remote — POST /me/funnel один раз, тихо, без ожидания", async () => {
    mode.current = "remote";
    const { request, setRemoteToken, trackStep } = await load();
    setRemoteToken("tok");
    request.mockResolvedValue({ ok: true });
    trackStep("share_channel_copy");
    trackStep("share_channel_copy");
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith(
      "POST",
      "/me/funnel",
      { step: "share_channel_copy" },
      undefined,
      { quiet: true },
    );
  });

  it("remote — ошибку запроса глотает, не повторяет", async () => {
    mode.current = "remote";
    const { request, setRemoteToken, trackStep } = await load();
    setRemoteToken("tok");
    request.mockRejectedValue(new Error("429"));
    expect(() => trackStep("rate_limited_seen")).not.toThrow();
    await flushMicrotasks();
    trackStep("rate_limited_seen");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("без профиля шаг ждёт и уходит, когда профиль появился", async () => {
    mode.current = "remote";
    const { flushFunnelSteps, request, setRemoteToken, trackStep } =
      await load();
    request.mockResolvedValue({ ok: true });
    trackStep("in_app_browser_seen");
    flushFunnelSteps();
    expect(request).not.toHaveBeenCalled();
    setRemoteToken("tok");
    flushFunnelSteps();
    flushFunnelSteps();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0]?.[2]).toEqual({ step: "in_app_browser_seen" });
  });

  it("сессия закончилась — шаг ждёт нового профиля", async () => {
    mode.current = "remote";
    const {
      clearRemoteSession,
      flushFunnelSteps,
      markRemoteSessionExpired,
      request,
      setRemoteToken,
      trackStep,
    } = await load();
    request.mockResolvedValue({ ok: true });
    setRemoteToken("old");
    markRemoteSessionExpired();
    trackStep("session_expired_seen");
    expect(request).not.toHaveBeenCalled();
    clearRemoteSession();
    setRemoteToken("new");
    flushFunnelSteps();
    expect(request).toHaveBeenCalledTimes(1);
  });
});
