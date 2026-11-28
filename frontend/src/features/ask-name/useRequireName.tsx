"use client";

import { type ReactNode, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { type User, useMe } from "@/entities/user";

import { isNameRequired, userKeys } from "@/shared/api";

import { NameSheet } from "./ui/NameSheet";

type Action = () => unknown;

// «Сначала имя, потом действие» (DESIGN.md §7 NameSheet): есть имя —
// действие сразу; нет — NameSheet, после «Продолжить» действие продолжается
// само. На NAME_REQUIRED от сервера — та же шторка и повтор запроса.
export const useRequireName = (
  caption: (name: string) => string,
  // Имя, которое уже известно по месту, — например, «Кому: Нурай» из
  // ссылки-фильтра (UX-аудит W10). Поле заполнено, его можно поправить.
  initialName?: string,
): {
  // Ответ сервера NAME_REQUIRED: спросить имя и повторить.
  handleError: (error: unknown, retry: Action) => boolean;
  // Профиль загружен, а имени нет — для шторок, где имя — первый шаг внутри.
  needsName: boolean;
  run: (action: Action) => void;
  sheet: ReactNode;
} => {
  const me = useMe();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<Action | null>(null);
  const needsName = Boolean(me.data) && !me.data?.name?.trim();

  // Профиль — из кэша на момент вызова: run зовут и сразу после создания
  // профиля («Вступить» без профиля), когда рендер ещё старый. Профиль не
  // загружен — не гадаем: действие идёт сразу, а если имени нет, сервер
  // ответит NAME_REQUIRED, и шторка откроется по нему.
  const run = (action: Action) => {
    const current = queryClient.getQueryData<User>(userKeys.me()) ?? me.data;
    if (current && !current.name?.trim()) setPending(() => action);
    else action();
  };

  const handleError = (error: unknown, retry: Action) => {
    if (!isNameRequired(error)) return false;
    setPending(() => retry);
    return true;
  };

  const sheet = (
    <NameSheet
      open={pending !== null}
      caption={caption}
      initialName={initialName}
      onClose={() => setPending(null)}
      onSaved={() => {
        const action = pending;
        setPending(null);
        action?.();
      }}
    />
  );

  return { run, handleError, needsName, sheet };
};
