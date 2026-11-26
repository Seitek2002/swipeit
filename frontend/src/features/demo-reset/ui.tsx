"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { resetDemo } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useSessionStore } from "@/shared/store";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

type Props = {
  className?: string;
};

// «Сбросить демо-данные» (DESIGN.md §8.9): ConfirmDialog → база заново из
// сида → сессия вкладки пуста → снова знакомство. Нужно, чтобы показать
// демо следующему человеку с чистого листа.
export const ResetDemoButton = ({ className }: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const [open, setOpen] = useState(false);

  const reset = useMutation({
    mutationFn: resetDemo,
    onSuccess: () => {
      setOpen(false);
      setActiveUser(null);
      queryClient.clear();
      toast("Демо-данные сброшены");
      router.replace(ROUTES.ONBOARDING);
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
        Сбросить демо-данные
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => reset.mutate()}
        isLoading={reset.isPending}
        variant="danger"
        title="Сбросить демо-данные?"
        description="Профиль, вишлист, планы и игры удалятся с этого устройства. Начнёшь заново со знакомства."
        confirmLabel="Сбросить"
      />
    </>
  );
};
