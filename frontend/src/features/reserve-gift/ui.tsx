"use client";

import { useState } from "react";

import { Check, Gift } from "lucide-react";

import { useGuestStore } from "@/shared/store";
import { BottomSheet, Button, TextField } from "@/shared/ui";

import {
  useCancelReservation,
  useReservations,
  useReserve,
  useReserver,
} from "./model";

// «Сначала имя, потом действие» от features/ask-name (useRequireName): его
// даёт виджет — фичи друг друга не импортируют, а шторка на список одна.
export type NameGuard = {
  handleError: (error: unknown, retry: () => unknown) => boolean;
  run: (action: () => unknown) => void;
};

type Props = {
  itemKey: string;
  // Профиль без имени — NameSheet, имя сохраняется в профиль (DESIGN.md
  // §8.5); бронь продолжается сама. NAME_REQUIRED от сервера — та же шторка.
  nameGuard: NameGuard;
  ownerId: string;
};

// Бронь на карточке чужого вишлиста (DESIGN.md §8.5, reference .g-act):
// «Забронирую я» → «Ты выбрал этот подарок» с «Отменить»; у других гостей —
// «Кто-то уже выбрал»; подаренное желание у забронировавшего — «Уже подарено».
export const ReserveControl = ({ ownerId, itemKey, nameGuard }: Props) => {
  const reserver = useReserver();
  const reservations = useReservations(ownerId);
  const reserve = useReserve(ownerId);
  const cancel = useCancelReservation(ownerId);
  const setGuestName = useGuestStore((state) => state.setName);
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState("");

  const { state, id } = reservations.stateOf(itemKey);

  // Гость без профиля называется только для брони (как было), профиль —
  // через NameSheet. Имя профиля сервер берёт сам.
  const reserveAs = (guestName?: string) =>
    reserve.mutate(
      { itemKey, name: guestName },
      {
        onError: (error) =>
          nameGuard.handleError(error, () => reserveAs(guestName)),
      },
    );

  const handleReserve = () => {
    if (reserver.needsName) {
      setAskName(true);
      return;
    }
    if (reserver.isGuest) reserveAs(reserver.name);
    else nameGuard.run(() => reserveAs());
  };

  const handleName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGuestName(trimmed);
    setAskName(false);
    reserveAs(trimmed);
  };

  if (state === "closed") {
    return (
      <div className="border-ink-soft/45 text-ink-soft rounded-field flex min-h-12 items-center justify-center gap-2 border-[1.5px] border-dashed text-[15px] leading-5 font-semibold">
        <Gift aria-hidden size={18} strokeWidth={1.75} />
        Уже подарено
      </div>
    );
  }

  if (state === "taken") {
    return (
      <div className="border-ink-soft/45 text-ink-soft rounded-field flex min-h-12 items-center justify-center gap-2 border-[1.5px] border-dashed text-[15px] leading-5 font-semibold">
        Кто-то уже выбрал
      </div>
    );
  }

  if (state === "mine") {
    return (
      <div className="bg-paper-2 rounded-field flex min-h-12 items-center justify-between gap-2 pr-1.5 pl-3.5 text-[15px] leading-5 font-semibold">
        <span className="flex items-center gap-2">
          <Check aria-hidden size={18} strokeWidth={2} />
          Ты выбрал этот подарок
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="text-ink-soft"
          loading={cancel.isPending}
          onClick={() => id && cancel.mutate(id)}
        >
          Отменить
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button
        className="w-full"
        loading={reserve.isPending || reservations.isLoading}
        onClick={handleReserve}
      >
        Забронирую я
      </Button>
      <BottomSheet
        open={askName}
        onClose={() => setAskName(false)}
        title="Как тебя зовут?"
        footer={
          <Button size="lg" disabled={!name.trim()} onClick={handleName}>
            Забронировать
          </Button>
        }
      >
        <p className="text-body text-rose mb-4">
          Имя увидит только тот, кто тоже бронирует. Владелец вишлиста не
          узнает, кто что выбрал.
        </p>
        <TextField
          label="Имя"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleName();
          }}
        />
      </BottomSheet>
    </>
  );
};
