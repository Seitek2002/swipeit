import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setRemoteToken, useRemoteSessionStore } from "@/shared/store";

import { remoteImageUrl, uploadRemoteImage } from "./remote-uploads";

process.env.NEXT_PUBLIC_API_URL = "http://api.test";

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

describe("фото через сервер (remote, B15)", () => {
  it("картинка — телом как есть, с токеном; ответ — ключ", async () => {
    setRemoteToken("tok");
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ key: "k1", url: "/v1/uploads/k1" }), {
        status: 200,
      }),
    );
    const blob = new Blob(["x"], { type: "image/jpeg" });
    await expect(uploadRemoteImage(blob)).resolves.toBe("k1");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/v1/uploads");
    expect(init?.body).toBe(blob);
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer tok");
    expect(headers["content-type"]).toBe("image/jpeg");
  });

  it("ошибка сервера — его текст («Слишком много фото»)", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ code: "RATE_LIMITED", message: "Слишком много фото" }),
        { status: 429 },
      ),
    );
    await expect(
      uploadRemoteImage(new Blob(["x"], { type: "image/png" })),
    ).rejects.toMatchObject({
      code: "RATE_LIMITED",
      message: "Слишком много фото",
    });
  });

  it("адрес фото — от сервера, ключ экранируется", () => {
    expect(remoteImageUrl("a/b")).toBe("http://api.test/v1/uploads/a%2Fb");
  });
});
