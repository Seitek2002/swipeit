import { GiftsPageSkeleton } from "@/pages/gifts";
import { OnboardingRedirect } from "@/pages/onboarding";

export default function Page() {
  return <OnboardingRedirect skeleton={<GiftsPageSkeleton />} />;
}
