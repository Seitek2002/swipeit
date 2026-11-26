import type { WishlistResponse } from "../../wishlist/types";
import type { Handler } from "../context";
import { requireUser } from "./common";
import { countSelfLikes } from "./swipes";

// GET /wishlist — свой вишлист с мета-данными. Подсказка «Возможно, тебе
// подарили это» и счётчик броней добавятся в T08–T09.
export const getMyWishlist: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const response: WishlistResponse = {
    items: [...(db.wishlistItems[user.id] ?? [])].sort(
      (a, b) => a.order - b.order,
    ),
    meta: db.wishlistMeta[user.id] ?? {
      ownerId: user.id,
      hideReservationCount: false,
    },
    likeCount: countSelfLikes(db, user.id),
  };
  return response;
};
