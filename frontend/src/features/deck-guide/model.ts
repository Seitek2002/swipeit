"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useMe } from "@/entities/user";

import { markHintSeen, userKeys } from "@/shared/api";
import { useSessionStore } from "@/shared/store";

// У друга на /pick/ без профиля отметку негде хранить на сервере — ключ
// localStorage (разрешённая запись мимо мок-сервера, TASKS T22).
const LOCAL_HINTS_KEY = "swipeit:hints";

const readLocalSeen = () => {
  try {
    const raw = window.localStorage.getItem(LOCAL_HINTS_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) && list.includes("deck_guide");
  } catch {
    return false;
  }
};

const writeLocalSeen = () => {
  try {
    window.localStorage.setItem(
      LOCAL_HINTS_KEY,
      JSON.stringify(["deck_guide"]),
    );
  } catch {
    // Хранилище недоступно — слой покажется ещё раз, это не страшно.
  }
};

// Обучающая карточка (DESIGN.md §7 DeckGuide): пока подсказка deck_guide не
// отмечена — слой на первой карточке; улетела в любую сторону — отмечаем, и
// слоя больше нигде нет (и по «Вернуть» карточка приходит без него).
export const useDeckGuide = () => {
  const queryClient = useQueryClient();
  const userId = useSessionStore((state) => state.activeUserId);
  const me = useMe();
  // Свайп отмечаем сразу, не дожидаясь ответа сервера: запоминаем снимок
  // профиля, при котором слой ушёл. Придёт новый профиль (отметка сохранилась
  // или «Показать обучение снова» её сняла) — решает уже он.
  const [doneFor, setDoneFor] = useState<unknown>(null);
  const [localDone, setLocalDone] = useState(false);
  const [localSeen] = useState(() =>
    typeof window === "undefined" ? true : readLocalSeen(),
  );

  const known = userId ? me.data !== undefined : true;
  const seen = userId
    ? (me.data?.seenHints ?? []).includes("deck_guide")
    : localSeen;
  const doneLocally = userId ? doneFor === me.data : localDone;
  const active = known && !seen && !doneLocally;

  const done = () => {
    if (!active) return;
    if (!userId) {
      setLocalDone(true);
      writeLocalSeen();
      return;
    }
    setDoneFor(me.data);
    markHintSeen("deck_guide").then(
      (user) => queryClient.setQueryData(userKeys.me(), user),
      // Отметка не дошла — слой покажется в следующий раз, свайп не пропал.
      () => undefined,
    );
  };

  return { active, done };
};
