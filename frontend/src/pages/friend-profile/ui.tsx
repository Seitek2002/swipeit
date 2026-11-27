"use client";

import { Suspense } from "react";

import { useSearchParams } from "next/navigation";

import { AppHeader } from "@/widgets/app-header";
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

const ProfileContent = () => {
  const id = useSearchParams()?.get("id") ?? undefined;
  const user = useUser(id);
  const wishlist = useUserWishlist(id);

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
    <GuestWishlistView
      wishlist={wishlist.data}
      ownerId={user.data.id}
      ownerGender={audience === "all" ? undefined : audience}
      titleAs="h2"
    />
  );
};

// Профиль друга (DESIGN.md §8.9) = его вишлист в гостевом виде с
// бронированием — те же компоненты, что у ссылки /w/ (T09).
export const FriendProfilePage = () => (
  <Screen>
    <AppHeader title="Друзья" showBack backHref={ROUTES.FRIENDS} />
    <ScreenBody className="pb-6">
      <Suspense fallback={<ContentSkeleton />}>
        <ProfileContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
