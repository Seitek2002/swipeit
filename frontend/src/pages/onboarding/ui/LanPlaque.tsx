"use client";

import { useQuery } from "@tanstack/react-query";

import { demoKeys, getDemoUsers } from "@/shared/api";
import { useAppMode } from "@/shared/lib/app-status";
import { pluralize } from "@/shared/lib/format";
import { AvatarStack } from "@/shared/ui";

// Плашка режима «Локальная сеть» на первом шаге онбординга (DESIGN.md
// §8.11): сразу объясняет, зачем вводить имя, — здесь уже есть люди.
export const LanPlaque = () => {
  // Режим — хуком: приветствие рисуется до запуска вкладки, плашка
  // появляется, когда стало ясно, что это lan (и запрос уйдёт на ноутбук).
  const isLan = useAppMode() === "lan";
  const users = useQuery({
    queryKey: demoKeys.users(),
    queryFn: getDemoUsers,
    enabled: isLan,
  });
  if (!isLan) return null;
  const people = (users.data ?? []).filter((user) => !user.isBot);

  return (
    <div className="paper rounded-paper shadow-paper mt-4 flex items-center gap-3 px-4 py-3">
      <span aria-hidden className="bg-mint size-2 flex-none rounded-full" />
      <p className="text-caption text-ink min-w-0 flex-1">
        Ты в локальной сети SwipeIt.{" "}
        {people.length === 0
          ? "Ты здесь первый — позови друзей."
          : `Здесь уже ${pluralize(people.length, ["человек", "человека", "человек"])}: ${people
              .slice(0, 3)
              .map((user) => user.name)
              .join(", ")}${people.length > 3 ? "…" : ""}`}
      </p>
      {people.length > 0 && (
        <AvatarStack
          people={people.map((user) => ({
            id: user.id,
            name: user.name ?? "",
            color: user.avatarColor,
          }))}
          max={3}
          size={28}
          ring="paper"
        />
      )}
    </div>
  );
};
