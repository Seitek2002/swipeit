"use client";

import { useState } from "react";

import { useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";

import {
  SantaForm,
  type SantaFormValues,
  type SantaView,
  santaFormOf,
  santaFormValid,
  santaPatch,
  useSantaGame,
} from "@/entities/santa-game";

import {
  type UpdateSantaInput,
  isApiError,
  santaKeys,
  updateSantaGame,
} from "@/shared/api";
import { clock } from "@/shared/lib/clock";
import { BottomSheet, Button, IconButton, toast } from "@/shared/ui";

// Шторка «Изменить игру» (R03): те же поля, что при создании. До
// жеребьёвки — всё, после — только дата обмена: праздник перенесли.
const EditGameSheet = ({
  view,
  open,
  onClose,
}: {
  onClose: () => void;
  open: boolean;
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const drawn = view.game.status === "drawn";
  const [form, setForm] = useState<SantaFormValues>(() =>
    santaFormOf(view.game, clock.now()),
  );
  const patch = santaPatch(view.game, form);
  const changed = Object.keys(patch).length > 0;
  const save = useMutation({
    mutationFn: (input: UpdateSantaInput) =>
      updateSantaGame(view.game.id, input),
    onSuccess: (next) => {
      queryClient.setQueryData(santaKeys.detail(view.game.id), next);
      void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
      onClose();
      toast("Игра изменена");
    },
    onError: (error) =>
      toast(isApiError(error) ? error.message : "Не получилось сохранить", {
        tone: "error",
      }),
  });
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Изменить игру"
      footer={
        <Button
          size="lg"
          disabled={!changed || !santaFormValid(form)}
          loading={save.isPending}
          // После жеребьёвки в форме только дата обмена — в правке ничего
          // другого и не будет.
          onClick={() => save.mutate(patch)}
        >
          Сохранить
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-2">
        {drawn && (
          <p className="text-body text-rose">
            Жеребьёвка уже прошла — можно перенести только обмен подарками.
          </p>
        )}
        <SantaForm values={form} onChange={setForm} onlyExchangeDate={drawn} />
      </div>
    </BottomSheet>
  );
};

// Шторка «Изменить игру» и как её открыть. Форма заполняется из игры при
// каждом открытии: новый key — новая шторка без прошлых несохранённых
// правок. Закрытая остаётся смонтированной — иначе пропала бы анимация
// закрытия.
const useEditGameSheet = (view: SantaView | undefined) => {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  return {
    open: () => {
      setSession((value) => value + 1);
      setOpen(true);
    },
    sheet: view && (
      <EditGameSheet
        key={session}
        view={view}
        open={open}
        onClose={() => setOpen(false)}
      />
    ),
  };
};

// «Изменить игру» в шапке экрана игры — только организатору (R03). Шапка
// вне Suspense экрана, поэтому игру читает сама: запрос тот же, React Query
// его не повторит.
export const EditGameAction = () => {
  const id = useSearchParams()?.get("id") ?? undefined;
  const view = useSantaGame(id).data;
  const edit = useEditGameSheet(view);
  if (view?.role !== "owner") return null;
  return (
    <>
      <IconButton label="Изменить игру" onClick={edit.open}>
        <Pencil aria-hidden size={20} strokeWidth={1.75} />
      </IconButton>
      {edit.sheet}
    </>
  );
};

// Ссылка «Изменить игру» в подписи «Жеребьёвка не прошла» (Y09): та же
// шторка R03, что у карандаша в шапке.
export const EditGameLink = ({ view }: { view: SantaView }) => {
  const edit = useEditGameSheet(view);
  return (
    <>
      <button
        type="button"
        onClick={edit.open}
        className="text-paper font-semibold underline underline-offset-2"
      >
        Изменить игру
      </button>
      {edit.sheet}
    </>
  );
};
