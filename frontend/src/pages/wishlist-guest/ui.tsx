"use client";

import { type ReactNode, Suspense, useId } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";

import {
  GuestWishlistHeader,
  GuestWishlistView,
} from "@/widgets/guest-wishlist";

import { useMe } from "@/entities/user";
import { useWishlistSummary } from "@/entities/wishlist";

import { importExternalWishlist, wishlistKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { IN_APP_BROWSER_NAMES } from "@/shared/lib/in-app-browser";
import { decodeWishlist } from "@/shared/lib/share-codec";
import { useGuestStore } from "@/shared/store";
import {
  Brand,
  BrokenLink,
  Button,
  InAppBrowserText,
  Screen,
  ScreenBody,
  Skeleton,
  buttonClassName,
  copyPageLink,
  useInAppBrowser,
  useMarkInAppNoteShown,
} from "@/shared/ui";

import { type GuestNextStep, guestNextStep } from "./model";

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

// После первой брони — под карточкой, ниже «Купить на …»: следующий шаг
// гостя, на шаг «купить» не наступает (auto-tasks P01). Тексты без рода и
// без падежей имени: гость и владелец могут быть кем угодно.
//
// Во встроенном браузере мессенджера (UX-аудит X09) порядок другой: сначала
// строка о том, что всё останется в Telegram, главная кнопка — «Скопировать
// ссылку» (открыть в Chrome или Safari), а свой вишлист здесь — вторичная, с
// подписью «здесь, в Telegram». Иначе человек нажимал оранжевую кнопку, не
// дочитав, и собирал вишлист там, где он потеряется.
const NextStepPlaque = ({
  step,
  onDismiss,
}: {
  onDismiss: () => void;
  step: GuestNextStep;
}) => {
  const browser = useInAppBrowser();
  // Предупреждение здесь — всегда, раз главная кнопка без него непонятна;
  // шторка «Вишлист готов» его уже не повторит (Q08: раз за сессию).
  useMarkInAppNoteShown(browser);
  const whereId = useId();
  const href = step === "send" ? `${ROUTES.WISHLIST}?share=1` : ROUTES.GIFTS;
  const label =
    step === "send" ? "Отправить свой вишлист" : "Собрать свой вишлист";
  const dismiss = (
    <Button
      size="sm"
      variant="ghost"
      className="text-ink-soft"
      onClick={onDismiss}
    >
      Не сейчас
    </Button>
  );

  return (
    <div
      role="status"
      className="bg-paper-2 rounded-field flex flex-col gap-2.5 px-3.5 pt-3 pb-2.5"
    >
      <p className="text-body text-ink">
        {step === "send"
          ? "Подарок выбран. Ответь своим вишлистом — тебе тоже угадают с подарком."
          : "Подарок выбран. А что хочешь ты? Собери свой вишлист за 2 минуты — друзья угадают с подарком."}
      </p>
      {browser ? (
        <>
          <InAppBrowserText browser={browser} />
          <Button
            size="sm"
            className="self-start"
            icon={<Copy aria-hidden size={16} strokeWidth={2} />}
            onClick={copyPageLink}
          >
            Скопировать ссылку
          </Button>
          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
            <span className="flex flex-col items-start gap-1">
              <Link
                href={href}
                aria-describedby={whereId}
                className={buttonClassName({
                  variant: "secondary",
                  size: "sm",
                })}
              >
                {label}
              </Link>
              <span id={whereId} className="text-caption text-ink-soft">
                здесь, в {IN_APP_BROWSER_NAMES[browser]}
              </span>
            </span>
            {dismiss}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <Link href={href} className={buttonClassName({ size: "sm" })}>
            {label}
          </Link>
          {dismiss}
        </div>
      )}
    </div>
  );
};

const GuestContent = () => {
  const encoded = useSearchParams()?.get("d") ?? "";
  const { data: me } = useMe();
  const summary = useWishlistSummary();
  const step = guestNextStep({
    hasProfile: Boolean(me),
    shareUnlocked: summary.shareUnlocked,
  });
  // Сначала разбираем сами: битую ссылку видно сразу, без запроса, а шапку
  // (имя, повод, сообщение) — сразу из ссылки (UX-аудит H2).
  const decoded = decodeWishlist(encoded);
  const isValid = decoded !== null;
  const queryClient = useQueryClient();
  // guestId — всегда: у профиля мок возьмёт его самого, а гостя без профиля
  // запомнит по нему для «Открывал по ссылке» (X03).
  const guestId = useGuestStore((state) => state.guestId);
  const external = useQuery({
    queryKey: wishlistKeys.external(encoded),
    queryFn: async () => {
      const result = await importExternalWishlist(encoded, guestId);
      void queryClient.invalidateQueries({ queryKey: wishlistKeys.opened() });
      return result;
    },
    enabled: isValid,
    staleTime: Infinity,
  });

  if (!decoded) return <BrokenLink />;
  if (external.isError) return <BrokenLink />;
  // Каталог и мок-сервер ещё грузятся: шапка из ссылки — сразу, бирки —
  // скелетонами по числу желаний (DESIGN.md §6: никогда неподвижный экран).
  if (!external.data) {
    return (
      <div role="status" aria-label="Загружаем вишлист">
        <GuestWishlistHeader
          owner={decoded.owner}
          occasion={decoded.occasion}
          message={decoded.message}
        />
        <ul aria-hidden className="flex flex-col gap-4 px-5 pt-[18px] pb-6">
          {decoded.items.slice(0, 3).map((item, index) => (
            <li key={item.key ?? item.productId ?? index}>
              <Skeleton tone="paper" className="h-72 rounded-[22px]" />
            </li>
          ))}
        </ul>
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
      reservationChat
      renderAfterReserve={(dismiss) => (
        <NextStepPlaque step={step} onDismiss={dismiss} />
      )}
      footer={
        <div className="px-5 pt-1 pb-[calc(env(safe-area-inset-bottom)+12px)] text-center">
          {isMine ? (
            <p className="text-caption text-rose">
              Это твой вишлист — так его видят друзья.
            </p>
          ) : me && step === "send" ? (
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
