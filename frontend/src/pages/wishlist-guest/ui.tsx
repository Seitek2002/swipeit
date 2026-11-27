"use client";

import { type ReactNode, Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { GuestWishlistView } from "@/widgets/guest-wishlist";

import { useMe } from "@/entities/user";

import { importExternalWishlist, wishlistKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { usePreloaderHold } from "@/shared/lib/preloader";
import { decodeWishlist } from "@/shared/lib/share-codec";
import {
  Brand,
  BrokenLink,
  Screen,
  ScreenBody,
  Skeleton,
  buttonClassName,
} from "@/shared/ui";

// Пока вишлист не пришёл: аватар владельца, заголовок, бумажный лист.
const GuestSkeleton = () => (
  <div
    role="status"
    aria-label="Загружаем вишлист"
    className="flex flex-col gap-4 px-5 pt-6"
  >
    <Skeleton className="size-14 rounded-full" />
    <Skeleton className="h-9 w-3/4" />
    <Skeleton tone="paper" className="h-72 rounded-[22px]" />
  </div>
);

const GuestContent = () => {
  const encoded = useSearchParams()?.get("d") ?? "";
  const { data: me } = useMe();
  // Сначала разбираем сами: битую ссылку видно сразу, без запроса.
  const isValid = decodeWishlist(encoded) !== null;
  const external = useQuery({
    queryKey: wishlistKeys.external(encoded),
    queryFn: () => importExternalWishlist(encoded),
    enabled: isValid,
    staleTime: Infinity,
  });

  // Гостевой вишлист держит прелоадер до своего первого запроса (T21).
  usePreloaderHold(
    "guest-wishlist",
    isValid && !external.data && !external.isError,
  );

  if (!isValid) return <BrokenLink />;
  if (external.isError) return <BrokenLink />;
  if (!external.data) return <GuestSkeleton />;

  const wishlist = external.data;
  const ownerId = wishlist.owner.userId ?? wishlist.id;
  const isMine = Boolean(me && me.id === wishlist.owner.userId);

  return (
    <GuestWishlistView
      wishlist={wishlist}
      ownerId={ownerId}
      readOnly={isMine}
      footer={
        <div className="px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+12px)] text-center">
          {isMine ? (
            <p className="text-caption text-rose">
              Это твой вишлист — так его видят друзья.
            </p>
          ) : me ? (
            <Link
              href={ROUTES.WISHLIST}
              className={buttonClassName({ variant: "secondary", size: "lg" })}
            >
              Открыть свой вишлист
            </Link>
          ) : (
            <>
              {/* Виральная петля (DESIGN.md §8.5): гость собирает свой. */}
              <Link
                href={ROUTES.GIFTS}
                className={buttonClassName({
                  variant: "secondary",
                  size: "lg",
                })}
              >
                Собрать свой вишлист
              </Link>
              <p className="text-caption text-rose mt-2.5">
                Свайпай подарки, которые хочешь сам, — друзья угадают с
                подарком.
              </p>
            </>
          )}
        </div>
      }
    />
  );
};

const Frame = ({ children }: { children: ReactNode }) => (
  <Screen>
    <div className="flex h-[52px] flex-none items-center px-5">
      <Link
        href={ROUTES.HOME}
        aria-label="SwipeIt"
        className="inline-flex min-h-11 items-center"
      >
        <Brand size="sm" />
      </Link>
    </div>
    <ScreenBody>{children}</ScreenBody>
  </Screen>
);

// Чужой вишлист по ссылке (DESIGN.md §8.5): без таб-бара и без регистрации.
export const WishlistGuestPage = () => (
  <Frame>
    <Suspense fallback={<GuestSkeleton />}>
      <GuestContent />
    </Suspense>
  </Frame>
);

// Тот же экран до запуска вкладки (app/route-skeleton.tsx): скелетон
// гостевого вишлиста вместо логотипа после прелоадера (DESIGN.md §6).
export const WishlistGuestPageSkeleton = () => (
  <Frame>
    <GuestSkeleton />
  </Frame>
);
