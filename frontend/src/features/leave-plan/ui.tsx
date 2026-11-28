"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { isApiError, leavePlan, planKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

type Props = {
  className?: string;
  planId: string;
  size?: "md" | "sm";
  title: string;
};

// «Выйти из плана» (auto-tasks-pm-2 Q04): человек передумал — его убирают из
// плана, его свайпы не попадают в итоги, и остальные не ждут его до
// «Показать итоги сейчас». Организатору кнопку не показывают: план держится
// на нём.
export const LeavePlanButton = ({
  className,
  planId,
  size = "md",
  title,
}: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const leave = useMutation({
    mutationFn: () => leavePlan(planId),
    onSuccess: () => {
      setOpen(false);
      // Сначала уйти с экрана плана: иначе он увидит «ты не участник» и
      // отправит на приглашение.
      router.replace(ROUTES.PLANS);
      queryClient.removeQueries({ queryKey: planKeys.detail(planId) });
      void queryClient.invalidateQueries({ queryKey: planKeys.list() });
      toast(`Готово — тебя нет в плане «${title}»`, { tone: "success" });
    },
    onError: (error: Error) => {
      setOpen(false);
      toast(
        isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз",
        { tone: "error" },
      );
    },
  });

  return (
    <>
      <Button
        variant="ghost"
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        Выйти из плана
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => leave.mutate()}
        isLoading={leave.isPending}
        title="Выйти из плана?"
        description={`Тебя уберут из плана «${title}». Твои свайпы не попадут в итоги`}
        confirmLabel="Выйти"
        variant="danger"
      />
    </>
  );
};
