"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { loadNewYearScenario } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useSessionStore } from "@/shared/store";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

// Демо-пользователь сценария — Айгерим (TECH_SPEC §6 /demo/scenario/new-year).
const SCENARIO_USER_ID = "u_aigerim";

type Props = { network?: boolean; onDone?: () => void };

// «Загрузить сценарий „Новый год“» (DESIGN.md §8.10, TASKS T19): готовое
// состояние для показа — вишлист из 7 желаний, у Нурай ДР через 5 дней, план
// «Новогодние каникулы» до даты, Санта «Офис, Новый год» перед жеребьёвкой.
export const LoadNewYearButton = ({ network = false, onDone }: Props) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const [open, setOpen] = useState(false);

  const load = useMutation({
    mutationFn: loadNewYearScenario,
    onSuccess: () => {
      setOpen(false);
      setActiveUser(SCENARIO_USER_ID);
      queryClient.clear();
      toast("Сценарий «Новый год» загружен");
      onDone?.();
      router.replace(ROUTES.WISHLIST);
    },
    onError: () =>
      toast("Не получилось загрузить сценарий. Попробуй ещё раз", {
        tone: "error",
      }),
  });

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Загрузить сценарий «Новый год»
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => load.mutate()}
        isLoading={load.isPending}
        title="Загрузить сценарий «Новый год»?"
        description={
          network
            ? "Данные всех участников сети заменятся готовым сценарием. Ты войдёшь как Айгерим."
            : "Данные на этом устройстве заменятся готовым сценарием. Ты войдёшь как Айгерим."
        }
        confirmLabel="Загрузить"
      />
    </>
  );
};
