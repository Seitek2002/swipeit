import { afterEach, describe, expect, it, vi } from "vitest";

import { mockTransport, setTransport } from "../transport";
import { createInviteLink, getShareTarget } from "./requests";

afterEach(() => setTransport(mockTransport));

describe("приглашения короткой ссылкой — запросы", () => {
  it("POST /share-links { kind, targetId } и GET /share/:code", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ url: "https://api/s/Ab12", code: "Ab12" })
      .mockResolvedValueOnce({ kind: "santa", gameId: "sg_1" });
    setTransport({ request });

    await expect(createInviteLink("santa", "sg_1")).resolves.toEqual({
      url: "https://api/s/Ab12",
      code: "Ab12",
    });
    expect(request).toHaveBeenNthCalledWith(1, "POST", "/share-links", {
      kind: "santa",
      targetId: "sg_1",
    });

    await expect(getShareTarget("Ab/12")).resolves.toEqual({
      kind: "santa",
      gameId: "sg_1",
    });
    // Код из адреса — в путь только экранированным.
    expect(request).toHaveBeenNthCalledWith(2, "GET", "/share/Ab%2F12");
  });
});
