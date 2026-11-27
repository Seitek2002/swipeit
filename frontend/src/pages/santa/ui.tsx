"use client";

import Link from "next/link";

import { Plus } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import {
  type SantaSummary,
  santaTerms,
  useSantaGames,
} from "@/entities/santa-game";

import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import {
  AvatarStack,
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
  buttonClassName,
} from "@/shared/ui";

// Статус игры в списке. Подопечного называем, только когда конверт вскрыт —
// список не должен испортить сюрприз.
const statusOf = (summary: SantaSummary) => {
  const joined = summary.members.filter((member) => member.joined).length;
  if (summary.game.status === "gathering") {
    return summary.role === "invited"
      ? { text: "Тебя позвали — вступи", accent: true }
      : {
          text: `Собираемся: ${joined} из ${summary.members.length}`,
          accent: false,
        };
  }
  const me = summary.me;
  if (me?.envelope === "ready")
    return { text: "Конверт ждёт тебя", accent: true };
  if (me?.ward) return { text: `Ты Санта для ${me.ward.name}`, accent: false };
  return { text: "Жеребьёвка прошла", accent: false };
};

const GameCard = ({ summary }: { summary: SantaSummary }) => {
  const status = statusOf(summary);
  return (
    <li>
      <Link
        href={ROUTES.SANTA_GAME(summary.game.id)}
        className="paper rounded-paper shadow-paper flex flex-col gap-1 p-4"
      >
        <p className="text-title-2 truncate">{summary.game.title}</p>
        <p className="text-caption text-ink-soft">{santaTerms(summary.game)}</p>
        <div className="mt-2 flex items-center gap-2">
          <AvatarStack
            people={summary.members.map((member) => ({
              id: member.id,
              name: member.name,
              color: member.avatarColor,
            }))}
            size={26}
            ring="paper"
          />
          <span
            className={cn(
              "text-caption flex items-center gap-1.5",
              status.accent ? "text-ink font-semibold" : "text-ink-soft",
            )}
          >
            {status.accent && (
              <i aria-hidden className="bg-mandarin size-2 rounded-full" />
            )}
            {status.text}
          </span>
        </div>
      </Link>
    </li>
  );
};

// Тайный Санта — список игр (DESIGN.md §8.8) и «Новая игра».
export const SantaPage = () => {
  const games = useSantaGames();
  const list = games.data ?? [];

  return (
    <Screen>
      <AppHeader title="Тайный Санта" />
      <ScreenBody className="px-5 pt-2">
        {games.isError ? (
          <EmptyState
            className="h-full"
            title="Не получилось загрузить игры. Проверь связь и попробуй ещё раз."
            action={
              <Button variant="secondary" onClick={() => void games.refetch()}>
                Попробовать ещё раз
              </Button>
            }
          />
        ) : !games.data ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((index) => (
              <Skeleton
                key={index}
                tone="paper"
                className="h-[104px] rounded-[22px]"
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="h-full"
            object="envelope"
            title="Тайный Санта: каждый дарит одному другу и не знает, кто дарит ему. Жеребьёвка честная, пары не видит никто."
            action={
              <Link
                href={ROUTES.SANTA_CREATE}
                className={buttonClassName({ size: "lg" })}
              >
                Новая игра
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3 pb-24">
            {list.map((summary) => (
              <GameCard key={summary.game.id} summary={summary} />
            ))}
          </ul>
        )}
      </ScreenBody>
      {list.length > 0 && (
        <div className="from-velvet pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-60% to-transparent px-5 pt-7 pb-[calc(var(--tabbar-space)-8px)]">
          <Link
            href={ROUTES.SANTA_CREATE}
            className={cn(
              buttonClassName({ size: "lg" }),
              "pointer-events-auto w-full",
            )}
          >
            <Plus aria-hidden size={20} strokeWidth={2} />
            Новая игра
          </Link>
        </div>
      )}
    </Screen>
  );
};
