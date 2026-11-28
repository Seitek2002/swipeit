import type { Metadata } from "next";

import { shareMetadata } from "@/app/share-metadata";

import { WishlistGuestPage } from "@/pages/wishlist-guest";

import {
  ROUTES,
  WISHLIST_LINK_DESCRIPTION,
  WISHLIST_LINK_TITLE,
} from "@/shared/config";

// Превью ссылки на вишлист в чате (UX-аудит G02).
export const metadata: Metadata = {
  description: WISHLIST_LINK_DESCRIPTION,
  ...shareMetadata({
    path: ROUTES.WISHLIST_GUEST,
    title: WISHLIST_LINK_TITLE,
    description: WISHLIST_LINK_DESCRIPTION,
  }),
};

export default function Page() {
  return <WishlistGuestPage />;
}
