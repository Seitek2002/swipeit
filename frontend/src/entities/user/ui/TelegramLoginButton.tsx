"use client";

import { REMOTE_COPY } from "@/shared/config";
import { pluralize } from "@/shared/lib/format";
import { Button, ConfirmDialog } from "@/shared/ui";

import { useTelegramLogin } from "../api";

// «Войти через Telegram» (BACKEND.md §3.3, auto-tasks-pm-4 S03) и вопрос
// «Войти в другой профиль?», если на этом телефоне собран вишлист, а у
// Telegram — свой профиль. Без NEXT_PUBLIC_TELEGRAM_CLIENT_ID и не в remote
// ничего не рисует.
export const TelegramLoginButton = ({
  className,
  variant = "secondary",
}: {
  className?: string;
  variant?: "primary" | "secondary";
}) => {
  const telegram = useTelegramLogin();
  if (!telegram.enabled) return null;
  const wishes = telegram.switchWishes;

  return (
    <>
      <Button
        variant={variant}
        className={className}
        loading={telegram.busy && wishes === null}
        onClick={telegram.start}
      >
        {REMOTE_COPY.telegramLogin}
      </Button>
      <ConfirmDialog
        open={wishes !== null}
        onClose={telegram.cancelSwitch}
        isLoading={telegram.busy}
        title={REMOTE_COPY.telegramSwitchTitle}
        description={REMOTE_COPY.telegramSwitchText(
          pluralize(wishes ?? 0, ["желание", "желания", "желаний"]),
        )}
        confirmLabel={REMOTE_COPY.telegramSwitchConfirm}
        cancelLabel={REMOTE_COPY.telegramSwitchCancel}
        onConfirm={telegram.confirmSwitch}
      />
    </>
  );
};
