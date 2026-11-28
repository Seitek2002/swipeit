"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  ExclusionList,
  PairSheet,
  type SantaPair,
  type SantaPerson,
  type SantaView,
  canAddPair,
  pairsAmong,
  withPair,
  withoutPair,
} from "@/entities/santa-game";

import { isApiError, santaKeys, updateSantaGame } from "@/shared/api";

// «Исключения» на экране игры — организатору до жеребьёвки (R03). Люди
// вступают по ссылке уже после создания: супругов из одного офиса теперь
// можно развести здесь. Выбирать — из вступивших и позванных, не из друзей.
// Невозможные исключения сервер не примет: его текст — под секцией, пара
// не добавляется.
export const Exclusions = ({ view }: { view: SantaView }) => {
  const queryClient = useQueryClient();
  const [pairOpen, setPairOpen] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const people: SantaPerson[] = view.members.map((member) => ({
    id: member.id,
    name: member.name,
    avatarColor: member.avatarColor,
  }));
  const pairs = pairsAmong(view.game.exclusions, people);
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? "…";

  const save = useMutation({
    mutationFn: (exclusions: SantaPair[]) =>
      updateSantaGame(view.game.id, { exclusions }),
    onSuccess: (next) => {
      setError(null);
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
    },
    onError: (failure) =>
      setError(
        isApiError(failure)
          ? failure.message
          : "Не получилось сохранить. Попробуй ещё раз",
      ),
  });

  return (
    <>
      <ExclusionList
        pairs={pairs}
        nameOf={nameOf}
        addDisabled={!canAddPair(people, pairs)}
        busy={save.isPending}
        error={error}
        onAdd={() => setPairOpen(true)}
        onRemove={(pair) => save.mutate(withoutPair(pairs, pair))}
      />
      <PairSheet
        open={pairOpen}
        people={people}
        exclusions={pairs}
        onClose={() => setPairOpen(false)}
        onAdd={(pair) => {
          setPairOpen(false);
          save.mutate(withPair(pairs, pair));
        }}
      />
    </>
  );
};
