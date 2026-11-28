"use client";

import { useAppMode } from "@/shared/lib/app-status";
import { cn } from "@/shared/lib/utils";

// Подпись под «Позвать по ссылке» (UX-аудит W01): в демо данные живут в
// браузере, и приглашение в план или Санту откроется только на этом
// телефоне или в «Локальной сети». Без подписи первая же компания на показе
// упиралась на чужом телефоне в тупик. В «Локальной сети» подписи нет.
export const DemoLinkNote = ({ className }: { className?: string }) =>
  useAppMode() === "local" ? (
    <p className={cn("text-caption text-rose", className)}>
      В демо ссылка работает на этом телефоне или в режиме «Локальная сеть»
    </p>
  ) : null;
