import { getTransport } from "../transport";
import type {
  CustomWish,
  SwipeContext,
  SwipeDecision,
  SwipeResponse,
  WishlistItem,
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
): Promise<{ likeCount: number; productId: string }> =>
  getTransport().request("POST", "/swipes/undo", { context });

export const restartSwipes = (
  context: SwipeContext,
): Promise<{ removed: number }> =>
  getTransport().request("POST", "/swipes/restart", { context });

export const getMyWishlist = (): Promise<WishlistResponse> =>
  getTransport().request<WishlistResponse>("GET", "/wishlist");

const itemPath = (id: string) => `/wishlist/items/${encodeURIComponent(id)}`;

export const createCustomWish = (custom: CustomWish): Promise<WishlistItem> =>
  getTransport().request<WishlistItem>("POST", "/wishlist/items", custom);

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
