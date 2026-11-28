"use client";

import { type ReactNode, Suspense, useEffect, useId } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";

import {
  GuestWishlistHeader,
  GuestWishlistView,
} from "@/widgets/guest-wishlist";

import { type ReserveAccess } from "@/features/reserve-gift";

import { useMe } from "@/entities/user";
import { useWishlistSummary } from "@/entities/wishlist";

import {
  type GuestWishlist,
  getShare,
  importExternalWishlist,
  isApiError,
  wishlistKeys,
} from "@/shared/api";
import { GUEST_REFETCH_MS, ROUTES, shareScreenPath } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import {
  IN_APP_BROWSER_NAMES,
  type InAppBrowser,
} from "@/shared/lib/in-app-browser";
import { decodeWishlist } from "@/shared/lib/share-codec";
import { rememberLinkVia, useGuestStore } from "@/shared/store";
import {
  Brand,
  BrokenLink,
  Button,
  EmptyState,
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
// Короче текста по умолчанию: что делать, говорит кнопка «Скопировать
// ссылку для Chrome» под ним.
const inAppPlaqueText = (browser: InAppBrowser) =>
  `Ты в браузере ${IN_APP_BROWSER_NAMES[browser]} — бронь и вишлист останутся только здесь`;

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
          : browser
            ? // Во встроенном браузере плашка и так длиннее: карточка с ней
              // должна уместиться в экран 360×640 (Y10).
              "Подарок выбран. А что хочешь ты?"
            : "Подарок выбран. А что хочешь ты? Собери свой вишлист за 2 минуты — друзья угадают с подарком."}
      </p>
      {browser ? (
        <>
          <InAppBrowserText browser={browser} text={inAppPlaqueText} />
          {/* «…для Chrome»: рядом «Написать в чат, что беру» — две кнопки
              «Скопировать…» подряд гость путал (Y10). */}
          <Button
            size="sm"
            className="self-start"
            icon={<Copy aria-hidden size={16} strokeWidth={2} />}
            onClick={copyPageLink}
          >
            Скопировать ссылку для Chrome
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

// Вишлист глазами гостя и следующий шаг внизу — общий для короткой ссылки
// (remote) и длинной (?d=).
const GuestScreen = ({
  access,
  ownerId,
  ownerUserId,
  wishlist,
}: {
  access?: ReserveAccess;
  ownerId: string;
  ownerUserId?: string;
  wishlist: GuestWishlist;
}) => {
  const { data: me } = useMe();
  const summary = useWishlistSummary();
  const step = guestNextStep({
    hasProfile: Boolean(me),
    shareUnlocked: summary.shareUnlocked,
  });
  const isMine = Boolean(me && ownerUserId && me.id === ownerUserId);

  return (
    <GuestWishlistView
      wishlist={wishlist}
      ownerId={ownerId}
      access={access}
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

// Короткая ссылка сервера (remote, /w/?s=<код>, BACKEND.md §6.2): вишлист
// живой — перечитываем его раз в 30 секунд, пока вкладка на экране. Первое
// чтение — «открыл ссылку» (дружба с владельцем, §4.3), остальные — с
// x-swipeit-refetch: по ним сервер дружбу не ставит (Q07).
const ShortLinkGuest = ({ code }: { code: string }) => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const key = wishlistKeys.share(code);
  const share = useQuery({
    queryKey: key,
    queryFn: async () => {
      const refetch = queryClient.getQueryData(key) !== undefined;
      const view = await getShare(code, { refetch });
      // Открыл по ссылке — «Открывал по ссылке» на «Друзьях» (X03).
      if (!refetch) {
        void queryClient.invalidateQueries({
          queryKey: wishlistKeys.opened(),
        });
      }
      return view;
    },
    refetchInterval: GUEST_REFETCH_MS,
    refetchIntervalInBackground: false,
    // Ссылки нет — повторять нечего.
    retry: (count, error) =>
      !(isApiError(error) && error.code === "NOT_FOUND") && count < 2,
  });
  const view = share.data;

  // Код ссылки-фильтра или приглашения открыли на экране вишлиста — на свой
  // экран, как это сделало бы превью /s/<код>.
  useEffect(() => {
    if (view && view.kind !== "wishlist") {
      router.replace(shareScreenPath(view, code));
    }
  }, [view, code, router]);

  if (isApiError(share.error) && share.error.code === "NOT_FOUND") {
    return <BrokenLink closed />;
  }
  if (share.isError && !view) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть вишлист. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void share.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (view?.kind !== "wishlist") return <GuestSkeleton />;

  return (
    <GuestScreen
      wishlist={view.wishlist}
      ownerId={view.ownerId}
      ownerUserId={view.ownerId}
      access={{ share: code, live: true }}
    />
  );
};

// Старая длинная ссылка (/w/?d=…): снимок из адреса. В remote брони по
// снимку общие для гостей той же ссылки — перечитываем их по таймеру.
const LongLinkGuest = ({ encoded }: { encoded: string }) => {
  const remote = useAppMode() === "remote";
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
  return (
    <GuestScreen
      wishlist={wishlist}
      // В remote длинные ссылки — только из демо, и userId в них — профиль
      // демо, которого на сервере нет: брони — по id снимка (BACKEND.md
      // §6.4, owner_ref «ext:…»), их видят гости той же ссылки.
      ownerId={remote ? wishlist.id : (wishlist.owner.userId ?? wishlist.id)}
      ownerUserId={wishlist.owner.userId}
      access={remote ? { live: true } : undefined}
    />
  );
};

const GuestContent = () => {
  const params = useSearchParams();
  const code = params?.get("s") ?? "";
  const encoded = params?.get("d") ?? "";
  // Пришёл по ссылке — профиль, если он появится в этой вкладке, посчитается
  // «из ссылки» (Q01). Вне remote это значение никуда не уходит.
  useEffect(() => {
    rememberLinkVia("wishlist_link");
  }, []);
  if (code) return <ShortLinkGuest code={code} />;
  return <LongLinkGuest encoded={encoded} />;
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
