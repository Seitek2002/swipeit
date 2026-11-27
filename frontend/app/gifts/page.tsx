import { preloadGuideCover } from "@/app/guide-cover";

import { GiftsPage } from "@/pages/gifts";

export default function Page() {
  preloadGuideCover();
  return <GiftsPage />;
}
