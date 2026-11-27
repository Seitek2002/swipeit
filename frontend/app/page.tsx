import { preloadGuideCover } from "@/app/guide-cover";

import { GiftsPageSkeleton } from "@/pages/gifts";
import { HomePage } from "@/pages/home";

export default function Page() {
  preloadGuideCover();
  return <HomePage skeleton={<GiftsPageSkeleton />} />;
}
