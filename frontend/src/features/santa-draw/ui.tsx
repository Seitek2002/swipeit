"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  type SantaView,
  canAddPair,
  pairsAmong,
  santaPeople,
} from "@/entities/santa-game";

import { drawSantaGame, isApiError, santaKeys } from "@/shared/api";
import { Button, ConfirmDialog, toast } from "@/shared/ui";

import { drawConfirmText, namesakeNote } from "./model";

// «Провести жеребьёвку» (DESIGN.md §8.8): только через ConfirmDialog —
// поменять пары потом нельзя. Пары выбирает сервер (drawAssignments).
// Тёзки среди вступивших (R04) — подпись над кнопкой и та же строка в
// подтверждении: убрать лишнего можно крестиком в строке участника (Q05).
// Исключения (Y04) — строкой в подтверждении: учитываются пары среди
// вступивших. Исключений нет — «Добавить исключение» закрывает диалог и
// открывает шторку «Эти двое не дарят друг другу» (onAddExclusion).
export const SantaDrawButton = ({
  view,
  meId,
  onAddExclusion,
}: {
  meId: string;
  onAddExclusion: () => void;
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const joined = view.members.filter((member) => member.joined);
  const withoutWishlist = joined.filter((member) => !member.hasWishlist).length;
  const namesakes = namesakeNote(joined.map((member) => member.name));
  const people = santaPeople(joined, meId);
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? "…";
  const pairs = pairsAmong(view.game.exclusions, people);
  const exclusions = pairs.map(([a, b]) => [nameOf(a), nameOf(b)] as const);
  // Добавить можно из всех в игре, не только вступивших (как в секции).
  const canAdd =
    pairs.length === 0 &&
    canAddPair(view.members, pairsAmong(view.game.exclusions, view.members));

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
        description={drawConfirmText({
          withoutWishlist,
          namesakes,
          exclusions,
        })}
        confirmLabel="Провести"
        extraAction={
          canAdd
            ? {
                label: "Добавить исключение",
                onClick: () => {
                  setOpen(false);
                  onAddExclusion();
                },
              }
            : undefined
        }
      />
    </>
  );
};
