import { getTransport } from "../transport";
import type {
  CustomWish,
  ExternalWishlist,
  GuestWishlist,
  Occasion,
  OpenedWishlist,
  SwipeContext,
  SwipeDecision,
  SwipeResponse,
  WishlistItem,
  WishlistMeta,
  WishlistResponse,
} from "./types";

export const createSwipe = (input: {
  context: SwipeContext;
  decision: SwipeDecision;
  productId: string;
  variantChoice?: Record<string, string>;
}): Promise<SwipeResponse> =>
  getTransport().request<SwipeResponse>("POST", "/swipes", input);

export const undoSwipe = (
  context: SwipeContext,
): Promise<{ productId: string; wishCount: number }> =>
  getTransport().request("POST", "/swipes/undo", { context });

export const restartSwipes = (
  context: SwipeContext,
): Promise<{ removed: number }> =>
  getTransport().request("POST", "/swipes/restart", { context });

export const getMyWishlist = (): Promise<WishlistResponse> =>
  getTransport().request<WishlistResponse>("GET", "/wishlist");

const itemPath = (id: string) => `/wishlist/items/${encodeURIComponent(id)}`;

// Ответ — само желание и порог отправки (TECH_SPEC §6 «Порог отправки»):
// пятым может стать и своё желание.
export type CreateCustomWishResponse = WishlistItem & {
  shareJustUnlocked: boolean;
  wishCount: number;
};

export const createCustomWish = (
  custom: CustomWish,
): Promise<CreateCustomWishResponse> =>
  getTransport().request<CreateCustomWishResponse>(
    "POST",
    "/wishlist/items",
    custom,
  );

export const updateWishlistItem = (
  id: string,
  patch: {
    note?: string;
    priority?: WishlistItem["priority"];
    variantChoice?: Record<string, string>;
  },
): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>("PATCH", itemPath(id), patch);

export const deleteWishlistItem = (id: string): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>("DELETE", itemPath(id));

export const undeleteWishlistItem = (
  item: WishlistItem,
): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>(
    "POST",
    `${itemPath(item.id)}/undelete`,
    item,
  );

export const reorderWishlist = (ids: string[]): Promise<{ ok: true }> =>
  getTransport().request("POST", "/wishlist/reorder", { ids });

export const markWishlistItemGiven = (
  id: string,
  given: { at: string; fromName?: string; fromUserId?: string },
): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>("POST", `${itemPath(id)}/given`, given);

export const restoreWishlistItem = (
  id: string,
  options: { undo?: boolean } = {},
): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>(
    "POST",
    `${itemPath(id)}/restore`,
    options,
  );

export const updateWishlistMeta = (patch: {
  hideReservationCount?: boolean;
  message?: string;
  occasion?: null | Occasion;
}): Promise<WishlistMeta> =>
  getTransport().request<WishlistMeta>("PATCH", "/wishlist/meta", patch);

// Относительный путь /w/?d=… — адрес сайта добавляет клиент.
export const shareWishlist = (): Promise<{ url: string }> =>
  getTransport().request<{ url: string }>("POST", "/wishlist/share");

export const dismissGivenHint = (): Promise<{ ok: true }> =>
  getTransport().request("POST", "/wishlist/given-hint/dismiss");

// guestId — гость без профиля: кто открыл ссылку (X03, «Открывал по ссылке»).
export const importExternalWishlist = (
  encoded: string,
  guestId?: string,
): Promise<ExternalWishlist> =>
  getTransport().request<ExternalWishlist>("POST", "/external-wishlists", {
    encoded,
    guestId,
  });

// «Открывал по ссылке» на «Друзьях» (X03).
export const getOpenedWishlists = (): Promise<OpenedWishlist[]> =>
  getTransport().request<OpenedWishlist[]>("GET", "/me/opened-wishlists");

export const getUserWishlist = (userId: string): Promise<GuestWishlist> =>
  getTransport().request<GuestWishlist>(
    "GET",
    `/users/${encodeURIComponent(userId)}/wishlist`,
  );
