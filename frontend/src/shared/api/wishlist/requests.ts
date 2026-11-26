import { getTransport } from "../transport";
import type {
  SwipeContext,
  SwipeDecision,
  SwipeResponse,
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
