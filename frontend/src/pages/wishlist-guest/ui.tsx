"use client";

import { Suspense } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";

import { GuestWishlistView } from "@/widgets/guest-wishlist";

import { useMe } from "@/entities/user";

import { importExternalWishlist, wishlistKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { decodeWishlist } from "@/shared/lib/share-codec";
import {
  Brand,
  BrokenLink,
  Screen,
  ScreenBody,
  Skeleton,
  Splash,
  buttonClassName,
} from "@/shared/ui";

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

  if (!isValid) return <BrokenLink />;
  if (external.isError) return <BrokenLink />;
  if (!external.data) {
    return (
      <div className="flex flex-col gap-4 px-5 pt-6">
        <Skeleton className="size-14 rounded-full" />
        <Skeleton className="h-9 w-3/4" />
        <Skeleton tone="paper" className="h-72 rounded-[22px]" />
      </div>
    );
  }

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
                href={ROUTES.ONBOARDING}
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

// Чужой вишлист по ссылке (DESIGN.md §8.5): без таб-бара и без регистрации.
export const WishlistGuestPage = () => (
  <Screen>
    <div className="flex h-[52px] flex-none items-center px-5">
      <Link href={ROUTES.HOME} aria-label="SwipeIt">
        <Brand size="sm" />
      </Link>
    </div>
    <ScreenBody>
      <Suspense fallback={<Splash />}>
        <GuestContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
