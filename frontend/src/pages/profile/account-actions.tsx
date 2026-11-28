"use client";

import { useState } from "react";

import {
  TelegramLoginButton,
  useDeleteMe,
  useLogout,
  useMe,
} from "@/entities/user";

import { isTelegramLoginEnabled } from "@/shared/api";
import { REMOTE_COPY } from "@/shared/config";
import { useMounted } from "@/shared/lib/dom";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

// «Войти через Telegram», «Выйти» и «Удалить профиль» — в remote вместо
// демо-кнопок (BACKEND.md §3.3, §3.4, §9.3). После «Выйти» и удаления — новый
// анонимный профиль, после удаления — ещё и тост «Профиль удалён»
// (entities/user). Тексты — R07 (REMOTE_COPY).
//
// Вход через Telegram (S03) — только при NEXT_PUBLIC_TELEGRAM_CLIENT_ID.
// Предупреждение у «Выйти» — всегда, а текст зависит от привязки: без
// Telegram вернуться в профиль с этого телефона нельзя.
export const AccountActions = () => {
  const logout = useLogout();
  const deleteMe = useDeleteMe();
  const [dialog, setDialog] = useState<"delete" | "logout" | null>(null);
  const close = () => setDialog(null);
  const mounted = useMounted();
  const telegramOn = mounted && isTelegramLoginEnabled();
  const me = useMe();
  // Вернуться через «Войти через Telegram» можно, только если кнопка есть.
  const linked = telegramOn && me.data?.telegramLinked === true;

  return (
    <>
      {telegramOn &&
        (linked ? (
          <p className="text-caption text-rose mt-3">
            {REMOTE_COPY.telegramLinkedHint}
          </p>
        ) : (
          <>
            <TelegramLoginButton className="mt-3" />
            <p className="text-caption text-rose mt-1.5">
              {REMOTE_COPY.telegramLoginHint}
            </p>
          </>
        ))}
      <Button
        variant="secondary"
        className="mt-3"
        onClick={() => setDialog("logout")}
      >
        Выйти
      </Button>
      <Button
        variant="danger"
        className="mt-3 self-start px-0"
        onClick={() => setDialog("delete")}
      >
        Удалить профиль
      </Button>
      <ConfirmDialog
        open={dialog === "logout"}
        onClose={close}
        isLoading={logout.isPending}
        variant="danger"
        title={REMOTE_COPY.logoutTitle}
        description={
          linked ? REMOTE_COPY.logoutTelegramText : REMOTE_COPY.logoutText
        }
        confirmLabel={REMOTE_COPY.logoutConfirm}
        cancelLabel={REMOTE_COPY.logoutCancel}
        onConfirm={() =>
          logout.mutate(undefined, {
            onError: () =>
              toast("Не получилось выйти. Попробуй ещё раз", { tone: "error" }),
          })
        }
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={close}
        isLoading={deleteMe.isPending}
        variant="danger"
        title={REMOTE_COPY.deleteTitle}
        description={REMOTE_COPY.deleteText}
        confirmLabel={REMOTE_COPY.deleteConfirm}
        onConfirm={() =>
          deleteMe.mutate(undefined, {
            onError: () =>
              toast("Не получилось удалить. Попробуй ещё раз", {
                tone: "error",
              }),
          })
        }
      />
    </>
  );
};
