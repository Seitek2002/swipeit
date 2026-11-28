import { getTransport } from "../transport";
import type { InviteKind, InviteLink, ShareTarget } from "./types";

// Короткая ссылка на план или игру (§6.2). Звать может только участник;
// повторный вызов отдаёт ту же живую ссылку.
export const createInviteLink = (
  kind: InviteKind,
  targetId: string,
): Promise<InviteLink> =>
  getTransport().request<InviteLink>("POST", "/share-links", {
    kind,
    targetId,
  });

// Куда ведёт код из ?s=. Открыть может и гость без профиля; ссылки нет или
// она закрыта — NOT_FOUND «Ссылка больше не работает».
export const getShareTarget = (code: string): Promise<ShareTarget> =>
  getTransport().request<ShareTarget>(
    "GET",
    `/share/${encodeURIComponent(code)}`,
  );
