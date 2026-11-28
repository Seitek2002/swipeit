import type { Metadata } from "next";

import { shareMetadata } from "@/app/share-metadata";

import { PickInvitePage } from "@/pages/pick-invite";

import {
  PICK_LINK_DESCRIPTION,
  PICK_LINK_TITLE,
  ROUTES,
} from "@/shared/config";

// Превью ссылки «Выбери подарок сам» в чате (UX-аудит G02).
export const metadata: Metadata = {
  description: PICK_LINK_DESCRIPTION,
  ...shareMetadata({
    path: ROUTES.PICK_INVITE,
    title: PICK_LINK_TITLE,
    description: PICK_LINK_DESCRIPTION,
  }),
};

export default function Page() {
  return <PickInvitePage />;
}
