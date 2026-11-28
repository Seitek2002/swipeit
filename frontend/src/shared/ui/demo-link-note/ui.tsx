"use client";

import type { ReactNode } from "react";

import { useAppMode } from "@/shared/lib/app-status";
import { cn } from "@/shared/lib/utils";

// Подпись под «Позвать по ссылке» (UX-аудит W01): в демо данные живут в
// браузере, и приглашение в план или Санту откроется только на этом
// телефоне или в «Локальной сети». Без подписи первая же компания на показе
// упиралась на чужом телефоне в тупик. В «Локальной сети» подписи нет.
// children — свой текст о том же (X01: брони вишлиста не уходят с телефона).
export const DemoLinkNote = ({
  children = "В демо ссылка работает на этом телефоне или в режиме «Локальная сеть»",
  className,
}: {
  children?: ReactNode;
  className?: string;
}) =>
  useAppMode() === "local" ? (
    <p className={cn("text-caption text-rose", className)}>{children}</p>
  ) : null;
