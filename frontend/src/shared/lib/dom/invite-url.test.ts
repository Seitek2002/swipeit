import { describe, expect, it, vi } from "vitest";

import type { ApiMode, InviteLink } from "@/shared/api";

import { createInviteUrl, joinPath, shareTargetPath } from "./invite-url";

const absolute = (path: string) =>
  /^https?:/.test(path) ? path : `https://app.test${path}`;

const setup = (mode: ApiMode) => {
  const createLink = vi.fn((kind: string, id: string): Promise<InviteLink> =>
    Promise.resolve({
      code: `${kind}-${id}`,
      url: `https://api.test/s/${kind}-${id}`,
    }),
  );
  const inviteUrl = createInviteUrl({
    absolute,
    createLink,
    mode: () => mode,
  });
  return { createLink, inviteUrl };
};

describe("inviteUrl — одна функция для ссылок-приглашений (R07)", () => {
  it("local и lan — адрес экрана приглашения, без сервера", async () => {
    for (const mode of ["local", "lan"] as const) {
      const { createLink, inviteUrl } = setup(mode);
      await expect(inviteUrl("plan", "pl_1")).resolves.toBe(
        "https://app.test/plans/join/?id=pl_1",
      );
      await expect(inviteUrl("santa", "sg_1")).resolves.toBe(
        "https://app.test/santa/join/?id=sg_1",
      );
      expect(createLink).not.toHaveBeenCalled();
    }
  });

  it("local — свой экран места вызова, как раньше («Решено», «Сообщить в чат»)", async () => {
    const { inviteUrl } = setup("local");
    await expect(
      inviteUrl("santa", "sg_1", "/santa/game/?id=sg_1"),
    ).resolves.toBe("https://app.test/santa/game/?id=sg_1");
  });

  it("remote — короткая ссылка сервера, одна на цель", async () => {
    const { createLink, inviteUrl } = setup("remote");
    await expect(
      inviteUrl("plan", "pl_1", "/plans/session/?id=pl_1"),
    ).resolves.toBe("https://api.test/s/plan-pl_1");
    await expect(inviteUrl("plan", "pl_1")).resolves.toBe(
      "https://api.test/s/plan-pl_1",
    );
    expect(createLink).toHaveBeenCalledTimes(1);
    expect(createLink).toHaveBeenCalledWith("plan", "pl_1");
    await inviteUrl("santa", "pl_1");
    expect(createLink).toHaveBeenCalledTimes(2);
  });

  it("remote — сбой не запоминается: следующее нажатие спросит снова", async () => {
    const { createLink, inviteUrl } = setup("remote");
    createLink.mockRejectedValueOnce(new Error("offline"));
    await expect(inviteUrl("santa", "sg_1")).rejects.toThrow("offline");
    await expect(inviteUrl("santa", "sg_1")).resolves.toBe(
      "https://api.test/s/santa-sg_1",
    );
    expect(createLink).toHaveBeenCalledTimes(2);
  });
});

describe("joinPath и shareTargetPath", () => {
  it("экран приглашения по виду", () => {
    expect(joinPath("plan", "a b")).toBe("/plans/join/?id=a%20b");
    expect(joinPath("santa", "sg_1")).toBe("/santa/join/?id=sg_1");
  });

  it("код ?s= → экран плана или игры; другой вид — null", () => {
    expect(shareTargetPath({ kind: "plan", planId: "pl_1" })).toBe(
      "/plans/join/?id=pl_1",
    );
    expect(shareTargetPath({ kind: "santa", gameId: "sg_1" })).toBe(
      "/santa/join/?id=sg_1",
    );
    expect(shareTargetPath({ kind: "wishlist" })).toBeNull();
  });
});
