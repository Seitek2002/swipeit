"use client";

import { Suspense, useState } from "react";

import { useSearchParams } from "next/navigation";

import { Gift } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";
import { FriendPickSheet } from "@/widgets/friend-pick-sheet";
import { GuestWishlistView } from "@/widgets/guest-wishlist";

import { useUser } from "@/entities/user";
import { useUserWishlist } from "@/entities/wishlist";

import { isApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import {
  Button,
  ContentSkeleton,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
} from "@/shared/ui";

const ProfileContent = ({ id }: { id?: string }) => {
  const user = useUser(id);
  const wishlist = useUserWishlist(id);
  const [pickOpen, setPickOpen] = useState(false);

  const notFound =
    !id ||
    [user.error, wishlist.error].some(
      (error) => isApiError(error) && error.code === "NOT_FOUND",
    );
  if (notFound) {
    return <EmptyState className="h-full" title="Такого друга не нашли." />;
  }
  if (user.isError || wishlist.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось загрузить вишлист. Проверь связь и попробуй ещё раз."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void user.refetch();
              void wishlist.refetch();
            }}
          >
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!user.data || !wishlist.data) {
    return (
      <div className="flex flex-col gap-4 px-5 pt-2">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton tone="paper" className="h-72 rounded-[22px]" />
      </div>
    );
  }

  const audience = user.data.audience;
  return (
    <>
      <GuestWishlistView
        wishlist={wishlist.data}
        ownerId={user.data.id}
        ownerGender={audience === "all" ? undefined : audience}
        titleAs="h2"
        headerAction={
          // Подарок на выбор другу — здесь его и ищут, а не на дне шторки
          // фильтров своей ленты (UX-аудит 27.11.2026, M5). Secondary:
          // мандарин на экране — у «Забронирую я».
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => setPickOpen(true)}
          >
            <Gift aria-hidden size={18} strokeWidth={1.75} />
            Предложить выбрать подарок
          </Button>
        }
      />
      <FriendPickSheet
        friendName={user.data.name ?? ""}
        open={pickOpen}
        onClose={() => setPickOpen(false)}
      />
    </>
  );
};

const ProfileScreen = () => {
  const id = useSearchParams()?.get("id") ?? undefined;
  const { data: user } = useUser(id);
  const name = user?.name?.trim();

  return (
    <Screen>
      {/* В шапке — имя друга, «Назад» — к списку друзей (UX-аудит, L3).
          Пока имени нет — только «Назад», заголовок для скринридера. */}
      <AppHeader
        title={name || <span className="sr-only">Профиль друга</span>}
        showBack
        backHref={ROUTES.FRIENDS}
      />
      <ScreenBody>
        <ProfileContent id={id} />
      </ScreenBody>
    </Screen>
  );
};

// Профиль друга (DESIGN.md §8.9) = его вишлист в гостевом виде с
// бронированием — те же компоненты, что у ссылки /w/ (T09).
export const FriendProfilePage = () => (
  <Suspense
    fallback={
      <Screen>
        <AppHeader
          title={<span className="sr-only">Профиль друга</span>}
          showBack
          backHref={ROUTES.FRIENDS}
        />
        <ScreenBody>
          <ContentSkeleton />
        </ScreenBody>
      </Screen>
    }
  >
    <ProfileScreen />
  </Suspense>
);
