"use client";

import { useState } from "react";

import { useDeleteMe, useLogout } from "@/entities/user";

import { Button, ConfirmDialog, toast } from "@/shared/ui";

// «Выйти» и «Удалить профиль» — в remote вместо демо-кнопок (BACKEND.md §3.4,
// §9.3). После обоих — новый анонимный профиль. «Войти через Telegram» —
// задача B19. Тексты — черновые по §3.4, финальные — PM.
//
// Предупреждение у «Выйти» — всегда: Telegram пока не привязать, а без него
// вернуться в профиль с этого телефона нельзя.
export const AccountActions = () => {
  const logout = useLogout();
  const deleteMe = useDeleteMe();
  const [dialog, setDialog] = useState<"delete" | "logout" | null>(null);
  const close = () => setDialog(null);

  return (
    <>
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
        title="Выйти из профиля?"
        description="Профиль пропадёт с этого телефона, вернуть его будет нельзя. Начнёшь заново с пустого профиля."
        confirmLabel="Выйти"
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
        title="Удалить профиль?"
        description="Вишлист, даты, свайпы и ссылки удалятся навсегда. В чужих планах и играх останется «Удалённый профиль» без имени."
        confirmLabel="Удалить"
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
