"use client";

import Link from "next/link";

import { ChevronRight, Gift } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { type FriendSummary, useFriends } from "@/entities/user";

import { ROUTES } from "@/shared/config";
import { formatBirthday, pluralize } from "@/shared/lib/format";
import {
  Avatar,
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
} from "@/shared/ui";

// Ближайший день рождения ближе этого порога — карточкой над списком.
const SOON_DAYS = 30;

// «Сегодня у Нурай», «Завтра у Нурай», «Через 5 дней у Нурай».
const whenLabel = (days: number) =>
  days === 0
    ? "Сегодня"
    : days === 1
      ? "Завтра"
      : `Через ${pluralize(days, ["день", "дня", "дней"])}`;

const rowNote = ({ user, daysToBirthday }: FriendSummary) => {
  if (!user.birthday || daysToBirthday === null)
    return "День рождения не указан";
  const date = formatBirthday(user.birthday);
  if (daysToBirthday === 0) return `${date} — сегодня день рождения`;
  if (daysToBirthday <= SOON_DAYS) {
    return `${date} — ${whenLabel(daysToBirthday).toLocaleLowerCase("ru")}`;
  }
  return date;
};

// Ближайший день рождения (DESIGN.md §8.9): «Через 5 дней у Нурай —
// посмотреть вишлист».
const SoonCard = ({ friend }: { friend: FriendSummary }) => (
  <Link
    href={ROUTES.FRIEND_PROFILE(friend.user.id)}
    className="paper rounded-paper shadow-paper mx-5 mt-2 flex items-center gap-3.5 px-4 py-3.5"
  >
    <Avatar
      name={friend.user.name}
      color={friend.user.avatarColor}
      size={48}
      decorative
    />
    <span className="min-w-0 flex-1">
      <span className="text-title-3 block">
        {whenLabel(friend.daysToBirthday ?? 0)} у {friend.user.name}
      </span>
      <span className="text-caption text-ink-soft mt-0.5 flex items-center gap-1">
        <Gift aria-hidden size={14} strokeWidth={1.75} />
        Посмотреть вишлист
      </span>
    </span>
    <ChevronRight
      aria-hidden
      size={22}
      strokeWidth={1.75}
      className="text-ink-soft flex-none"
    />
  </Link>
);

const FriendRow = ({ friend }: { friend: FriendSummary }) => (
  <li>
    <Link
      href={ROUTES.FRIEND_PROFILE(friend.user.id)}
      className="border-line flex min-h-[68px] items-center gap-3.5 border-b py-2.5"
    >
      <Avatar
        name={friend.user.name}
        color={friend.user.avatarColor}
        size={44}
        decorative
      />
      <span className="min-w-0 flex-1">
        <span className="text-body text-paper block font-semibold">
          {friend.user.name}
        </span>
        <span className="text-caption text-rose block">{rowNote(friend)}</span>
      </span>
      <ChevronRight
        aria-hidden
        size={20}
        strokeWidth={1.75}
        className="text-rose flex-none"
      />
    </Link>
  </li>
);

// Друзья (DESIGN.md §8.9): ближайшие дни рождения сверху, профиль друга —
// его вишлист в гостевом виде.
export const FriendsPage = () => {
  const friends = useFriends();
  const list = friends.data ?? [];
  // Список уже отсортирован сервером: ближайшие дни рождения — первыми.
  const nearest = list[0];
  const soon =
    nearest &&
    nearest.daysToBirthday !== null &&
    nearest.daysToBirthday <= SOON_DAYS
      ? nearest
      : null;

  return (
    <Screen>
      <AppHeader title="Друзья" showBack backHref={ROUTES.PROFILE} />
      <ScreenBody className="pb-6">
        {friends.isError ? (
          <EmptyState
            className="h-full"
            title="Не получилось загрузить друзей. Проверь связь и попробуй ещё раз."
            action={
              <Button
                variant="secondary"
                onClick={() => void friends.refetch()}
              >
                Попробовать ещё раз
              </Button>
            }
          />
        ) : !friends.data ? (
          <div className="flex flex-col gap-3 px-5 pt-2">
            <Skeleton tone="paper" className="h-[76px] rounded-[22px]" />
            {[0, 1, 2, 3].map((index) => (
              <Skeleton key={index} className="h-14" />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState className="h-full" title="Друзей пока нет." />
        ) : (
          <>
            {soon && <SoonCard friend={soon} />}
            <ul className="mt-3 px-5">
              {list.map((friend) => (
                <FriendRow key={friend.user.id} friend={friend} />
              ))}
            </ul>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
};
