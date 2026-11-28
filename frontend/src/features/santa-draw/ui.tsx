"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { SantaView } from "@/entities/santa-game";

import { drawSantaGame, isApiError, santaKeys } from "@/shared/api";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

import { drawConfirmText, namesakeNote } from "./model";

// «Провести жеребьёвку» (DESIGN.md §8.8): только через ConfirmDialog —
// поменять пары потом нельзя. Пары выбирает сервер (drawAssignments).
// Тёзки среди вступивших (R04) — подпись над кнопкой и та же строка в
// подтверждении: убрать лишнего можно крестиком в строке участника (Q05).
export const SantaDrawButton = ({ view }: { view: SantaView }) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const withoutWishlist = view.members.filter(
    (member) => member.joined && !member.hasWishlist,
  ).length;
  const namesakes = namesakeNote(
    view.members.filter((member) => member.joined).map((member) => member.name),
  );

  const draw = useMutation({
    mutationFn: () => drawSantaGame(view.game.id),
    onSuccess: (next) => {
      setOpen(false);
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
      toast("Жеребьёвка проведена");
    },
    onError: (error) => {
      setOpen(false);
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось провести жеребьёвку. Попробуй ещё раз",
        { tone: "error" },
      );
    },
  });

  return (
    <>
      {namesakes && <p className="text-caption text-rose">{namesakes}</p>}
      <Button
        size="lg"
        disabled={Boolean(view.drawIssue)}
        onClick={() => setOpen(true)}
      >
        Провести жеребьёвку
      </Button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        onConfirm={() => draw.mutate()}
        isLoading={draw.isPending}
        title="Провести жеребьёвку?"
        description={drawConfirmText({ withoutWishlist, namesakes })}
        confirmLabel="Провести"
      />
    </>
  );
};
