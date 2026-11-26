"use client";

import { useState } from "react";

import { AudiencePicker } from "@/features/profile-form";

import { useCreateUser } from "@/entities/user";

import { AVATAR_COLORS, type Audience } from "@/shared/config";
import { BottomSheet, Button, TextField, toast } from "@/shared/ui";

type Props = {
  onClose: () => void;
  onDone: () => void;
  open: boolean;
  senderName: string;
};

// Друг без профиля: вместо онбординга — только имя и «Показывать подарки»
// (от него зависят подарки в ленте и «выбрала / выбрал» у отправителя).
// Интересы можно добавить потом в профиле.
export const NameSheet = ({ open, onClose, onDone, senderName }: Props) => {
  const createUser = useCreateUser();
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || createUser.isPending) return;
    const avatarColor =
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ??
      "mandarin";
    createUser.mutate(
      { name: trimmed, avatarColor, interests: [], audience },
      {
        onSuccess: onDone,
        onError: () =>
          toast("Не получилось сохранить. Попробуй ещё раз", { tone: "error" }),
      },
    );
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Как тебя зовут?"
      footer={
        <Button
          size="lg"
          disabled={!trimmed}
          loading={createUser.isPending}
          onClick={submit}
        >
          Начать выбирать
        </Button>
      }
    >
      <p className="text-body text-rose mb-4">
        {senderName} увидит имя вместе с твоим выбором.
      </p>
      <div className="flex flex-col gap-5">
        <TextField
          label="Имя"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
        <AudiencePicker value={audience} onChange={setAudience} />
      </div>
    </BottomSheet>
  );
};
