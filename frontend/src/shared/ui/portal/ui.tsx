"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { useMounted } from "@/shared/lib/dom";

// Шторки, диалоги и тосты рендерятся в #overlay-root внутри рамки приложения
// (widgets/app-shell): на десктопе они остаются внутри «телефона», а не
// растягиваются на всё окно.
export const OverlayPortal = ({ children }: { children: ReactNode }) => {
  const mounted = useMounted();
  if (!mounted) return null;
  const target = document.getElementById("overlay-root") ?? document.body;
  return createPortal(children, target);
};
