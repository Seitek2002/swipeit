"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { resetDemo } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { useSessionStore } from "@/shared/store";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

type Props = {
  className?: string;
  // В демо-панели — «Сбросить всё» (DESIGN.md §8.10).
  label?: string;
  // В «Локальной сети» сброс действует на всех (DESIGN.md §8.10).
  network?: boolean;
};

// «Сбросить демо-данные» (DESIGN.md §8.9): ConfirmDialog → база заново из
// сида → сессия вкладки пуста → снова знакомство. Нужно, чтобы показать
// демо следующему человеку с чистого листа.
export const ResetDemoButton = ({
  className,
  label = "Сбросить демо-данные",
  network = false,
}: Props) => {
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const [open, setOpen] = useState(false);

  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: () => {
      setOpen(false);
      setActiveUser(null);
      queryClient.clear();
      // Полная перезагрузка: снова прелоадер, новый пустой профиль и
      // обучающая карточка (DESIGN.md §8.1), а не остатки старого кэша.
      window.location.assign(withBasePath(ROUTES.GIFTS));
    },
    onError: () =>
      toast("Не получилось сбросить. Попробуй ещё раз", { tone: "error" }),
  });

  return (
    <>
      <Button
        variant="danger"
        className={className}
        onClick={() => setOpen(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => reset.mutate()}
        isLoading={reset.isPending}
        variant="danger"
        title={
          network
            ? "Сбросить данные у всех участников сети?"
            : "Сбросить демо-данные?"
        }
        description={
          network
            ? "Профили, вишлисты, планы и игры удалятся на ноутбуке — у всех телефонов сети. Все начнут заново с пустого профиля."
            : "Профиль, вишлист, планы и игры удалятся с этого устройства. Начнёшь заново с пустого профиля и обучающей карточки."
        }
        confirmLabel="Сбросить"
      />
    </>
  );
};
