"use client";

import { useEffect, useState } from "react";

import QRCode from "qrcode";

import { COLORS } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
  label: string;
  value: string;
};

// QR рисуется на бумаге чернилами: сканерам нужен тёмный узор на светлом фоне,
// а светлый квадрат на бархате и так читается как бумажная вещь.
export const QrCode = ({ value, label, className }: Props) => {
  const [svg, setSvg] = useState("");

  useEffect(() => {
    if (!value) return;
    let cancelled = false;
    QRCode.toString(value, {
      type: "svg",
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: COLORS.ink, light: COLORS.paper },
    }).then((result) => {
      if (!cancelled) setSvg(result);
    });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "bg-paper aspect-square overflow-hidden rounded-field [&>svg]:block [&>svg]:h-full [&>svg]:w-full",
        className,
      )}
      // Разметка приходит из библиотеки qrcode и содержит только <svg> с путями.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
