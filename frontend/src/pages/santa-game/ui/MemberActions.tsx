"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import type { SantaView } from "@/entities/santa-game";

import {
  isApiError,
  leaveSantaGame,
  removeSantaMember,
  santaKeys,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

import { removeMemberCopy } from "../model/member-actions";

const onError = (error: Error) =>
  toast(isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз", {
    tone: "error",
  });

// «Убрать из игры» у строки участника — организатору (auto-tasks-pm-2 Q05):
// ссылку переслали дальше или коллега передумал. После жеребьёвки (R05) —
// коллега заболел или уволился: Санта убранного получит новое письмо.
// Убранный снова вступить не сможет.
export const RemoveMemberButton = ({
  view,
  member,
}: {
  member: { id: string; name: string };
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const copy = removeMemberCopy({
    name: member.name,
    gameTitle: view.game.title,
    drawn: view.game.status === "drawn",
  });
  const remove = useMutation({
    mutationFn: () => removeSantaMember(view.game.id, member.id),
    onSuccess: (next) => {
      setOpen(false);
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
    },
    onError: (error: Error) => {
      setOpen(false);
      onError(error);
    },
  });
  return (
    <>
      <button
        type="button"
        aria-label={`Убрать из игры: ${member.name}`}
        onClick={() => setOpen(true)}
        className="text-rose -mr-2 grid size-11 flex-none place-items-center rounded-full"
      >
        <X aria-hidden size={18} strokeWidth={1.75} />
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => remove.mutate()}
        isLoading={remove.isPending}
        title={copy.title}
        description={copy.description}
        confirmLabel="Убрать"
        variant="danger"
      />
    </>
  );
};

// «Выйти из игры» — участнику или позванному до жеребьёвки (Q05).
export const LeaveGameButton = ({ view }: { view: SantaView }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const leave = useMutation({
    mutationFn: () => leaveSantaGame(view.game.id),
    onSuccess: () => {
      setOpen(false);
      router.replace(ROUTES.SANTA);
      queryClient.removeQueries({ queryKey: santaKeys.detail(view.game.id) });
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
      toast(`Готово — тебя нет в игре «${view.game.title}»`);
    },
    onError: (error: Error) => {
      setOpen(false);
      onError(error);
    },
  });
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        Выйти из игры
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => leave.mutate()}
        isLoading={leave.isPending}
        title="Выйти из игры?"
        description={`Тебя уберут из «${view.game.title}» до жеребьёвки — подопечного у тебя не будет`}
        confirmLabel="Выйти"
        variant="danger"
      />
    </>
  );
};
