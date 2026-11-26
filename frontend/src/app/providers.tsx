"use client";

import type { ReactNode } from "react";

import { useTapHaptics } from "@/shared/lib/useTapHaptics";
import { Toaster } from "@/shared/ui";

// Провайдеры приложения. QueryClient, шина реального времени и боты
// добавятся в T04 и T12.
export const Providers = ({ children }: { children: ReactNode }) => {
  useTapHaptics();

  return (
    <>
      {children}
      <Toaster />
    </>
  );
};
