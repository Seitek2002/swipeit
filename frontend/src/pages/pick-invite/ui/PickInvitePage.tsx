"use client";

import { Suspense, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { GiftDeck } from "@/widgets/gift-deck";

import { useRequireName } from "@/features/ask-name";
import { ActiveFilterChips, describeFilters } from "@/features/product-filters";

import { useCreateUser, useMe } from "@/entities/user";

import {
  getMyPicks,
  getShare,
  isApiError,
  pickKeys,
  upToGifts,
} from "@/shared/api";
import { ROUTES, shareScreenPath } from "@/shared/config";
import { occasionLabel } from "@/shared/lib/format";
import {
  type SharedPickRequest,
  decodePickRequest,
} from "@/shared/lib/share-codec";
import { rememberLinkVia, useSessionStore } from "@/shared/store";
import {
  Avatar,
  Brand,
  BrokenLink,
  Button,
  ContentSkeleton,
  EmptyState,
  IconButton,
  Screen,
  ScreenBody,
} from "@/shared/ui";

import {
  type PickOverrides,
  countPicks,
  pickGoalText,
  pickProgress,
  progressText,
} from "../model";
import { SendPicksSheet } from "./SendPicksSheet";

const TopBar = ({ onBack }: { onBack?: () => void }) => (
  <div className="flex h-[52px] flex-none items-center gap-1 px-5">
    {onBack && (
      <IconButton label="Назад" className="-ml-3" onClick={onBack}>
        <ChevronLeft aria-hidden size={26} strokeWidth={1.75} />
      </IconButton>
    )}
    <Link
      href={ROUTES.HOME}
      aria-label="SwipeIt"
      className="inline-flex min-h-11 items-center"
    >
      <Brand size="sm" />
    </Link>
  </div>
);

// Приглашение (DESIGN.md §8.6): «Азамат хочет подарить тебе подарок»,
// условия курсивом, повод и сообщение.
const Invite = ({
  request,
  isMine,
  starting,
  startFailed,
  onStart,
}: {
  isMine: boolean;
  onStart: () => void;
  request: SharedPickRequest;
  startFailed: boolean;
  starting: boolean;
}) => {
  const occasion = occasionLabel(request.occasion);
  return (
    <>
      <ScreenBody className="px-5 pt-2.5">
        <Avatar
          name={request.from.name}
          color={request.from.avatarColor}
          size={56}
        />
        <h1 className="text-title-1 mt-3.5">
          {request.from.name} хочет подарить тебе подарок
        </h1>
        {occasion && (
          <p className="text-title-3 text-rose mt-0.5">{occasion}</p>
        )}
        <p className="text-title-2 mt-3 italic">
          {describeFilters(request.filters, {
            hidePrices: request.hidePrices,
          })}
        </p>
        {request.maxPicks !== undefined && (
          <p className="text-title-3 text-champagne mt-2">
            Можно выбрать {upToGifts(request.maxPicks)}
          </p>
        )}
        {request.message && (
          <p className="text-body bg-velvet-2 text-paper mt-4 rounded-[14px_14px_14px_4px] px-3.5 py-3">
            {request.message}
          </p>
        )}
        <ol className="text-body text-rose mt-5 flex list-inside list-decimal flex-col gap-1.5 pb-6">
          <li>Свайпай вправо то, что нравится, влево — мимо.</li>
          <li>{pickGoalText(request.maxPicks)}.</li>
          {/* Имя — подлежащим, в именительном (P11, G07): кыргызские имена
              по-русски склоняются неверно, и это видит каждый. */}
          <li>
            Отправь выбор — {request.from.name} увидит, что тебе нравится.
          </li>
        </ol>
      </ScreenBody>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {isMine && (
          <p className="text-caption text-rose mb-2.5 text-center">
            Это твоя ссылка — так её увидит друг.
          </p>
        )}
        <Button
          size="lg"
          className="w-full"
          loading={starting}
          onClick={onStart}
        >
          Выбрать подарки
        </Button>
        {startFailed && (
          <p role="alert" className="text-caption text-rose mt-2.5 text-center">
            Не получилось начать. Проверь связь и попробуй ещё раз
          </p>
        )}
      </div>
    </>
  );
};

// Подпись NameSheet у друга: кому уйдёт имя.
const nameCaption = (request: SharedPickRequest) => () =>
  `${request.from.name} увидит имя вместе с твоим выбором`;

// Лента друга: фильтры из ссылки заблокированы, свайпы — в контексте pick и
// в собственный вишлист не попадают. После 3 «Хочу» — «Отправить выбор».
const PickSwipe = ({
  request,
  onBack,
}: {
  onBack: () => void;
  request: SharedPickRequest;
}) => {
  const [sendOpen, setSendOpen] = useState(false);
  // Имя спрашиваем там, где его увидят: выбор уходит отправителю с именем
  // друга («Айгерим выбрала 5 подарков», DESIGN.md §8.6).
  const caption = nameCaption(request);
  const requireName = useRequireName(caption, request.toName);
  const picks = useQuery({
    queryKey: pickKeys.picks(request.id),
    queryFn: () => getMyPicks(request.id),
  });
  // Свежие «Хочу» и отмены, пока сервер их не подтвердил: лимит держим
  // сразу, а не после ответа на свайп.
  const [overrides, setOverrides] = useState<PickOverrides>(() => new Map());
  const mark = (productId: string, liked: boolean) =>
    setOverrides((current) => new Map(current).set(productId, liked));
  const progress = pickProgress(
    countPicks(
      (picks.data?.picks ?? []).map((pick) => pick.productId),
      overrides,
    ),
    request.maxPicks,
  );
  const { count, maxPicks } = progress;
  const openSend = () => requireName.run(() => setSendOpen(true));

  return (
    <>
      <TopBar onBack={onBack} />
      <p className="text-caption text-rose flex-none px-5">
        {request.from.name} хочет подарить тебе подарок
      </p>
      <ActiveFilterChips
        filters={request.filters}
        hidePrices={request.hidePrices}
        locked
      />
      <GiftDeck
        filters={request.filters}
        context={{ kind: "pick", requestId: request.id }}
        hidePrices={request.hidePrices}
        hideRibbon
        onLike={(product) => mark(product.id, true)}
        onUnlike={(product) => mark(product.id, false)}
        // Лимит выбран — колода кончается шагом отправки: больше «Хочу» не
        // поставить, заменить подарок — через «Вернуть».
        stopped={
          progress.full ? (
            <EmptyState
              title={`Выбрано ${count} из ${maxPicks}`}
              description="Больше выбрать нельзя. Отправь выбор — или верни карточку, чтобы заменить подарок."
              action={
                <Button size="lg" onClick={openSend}>
                  Отправить выбор
                </Button>
              }
            />
          ) : undefined
        }
      />
      <div className="flex min-h-[72px] flex-none flex-col justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {!progress.canSend ? (
          <p className="text-caption text-rose text-center" aria-live="polite">
            {progressText(progress)}
          </p>
        ) : progress.full ? (
          <p className="text-caption text-rose text-center" aria-live="polite">
            Выбрано {count} из {maxPicks} — это максимум
          </p>
        ) : (
          <Button size="lg" className="w-full" onClick={openSend}>
            {maxPicks === undefined
              ? "Отправить выбор"
              : `Отправить выбор · ${count} из ${maxPicks}`}
          </Button>
        )}
      </div>
      <SendPicksSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        request={request}
        count={count}
        full={progress.full}
        caption={caption}
      />
      {requireName.sheet}
    </>
  );
};

// Ссылка-фильтр — из адреса (?d=) или с сервера по короткой ссылке (?s=).
const PickFlow = ({ request }: { request: null | SharedPickRequest }) => {
  const activeUserId = useSessionStore((state) => state.activeUserId);
  const me = useMe();
  const [view, setView] = useState<"invite" | "swipe" | null>(null);
  // Друг без профиля: «Выбрать подарки» создаёт профиль сам (без имени и
  // без вопросов) — свайпам нужен профиль. Имя спросим при отправке выбора.
  const createUser = useCreateUser();
  const picks = useQuery({
    queryKey: pickKeys.picks(request?.id ?? ""),
    queryFn: () => getMyPicks(request?.id ?? ""),
    enabled: Boolean(request && me.data),
  });

  if (!request) {
    return (
      <>
        <TopBar />
        <ScreenBody>
          <BrokenLink />
        </ScreenBody>
      </>
    );
  }
  if (activeUserId && !me.data && !me.isError) return <PickSkeletonBody />;

  // Уже выбирал по этой ссылке — сразу в ленту.
  const shown =
    view ?? ((picks.data?.picks.length ?? 0) > 0 ? "swipe" : "invite");

  if (shown === "swipe" && me.data) {
    return <PickSwipe request={request} onBack={() => setView("invite")} />;
  }

  return (
    <>
      <TopBar />
      <Invite
        request={request}
        isMine={Boolean(me.data && me.data.id === request.from.userId)}
        starting={createUser.isPending}
        startFailed={createUser.isError}
        onStart={() => {
          if (me.data) setView("swipe");
          else
            createUser.mutate(undefined, {
              onSuccess: () => setView("swipe"),
            });
        }}
      />
    </>
  );
};

// Короткая ссылка сервера (remote, /pick/?s=<код>, BACKEND.md §6.2).
// Условия ссылки не меняются — перечитывать нечего.
const ShortPickInvite = ({ code }: { code: string }) => {
  const router = useRouter();
  const share = useQuery({
    queryKey: pickKeys.share(code),
    queryFn: () => getShare(code),
    staleTime: Infinity,
    retry: (count, error) =>
      !(isApiError(error) && error.code === "NOT_FOUND") && count < 2,
  });
  const view = share.data;

  // Код вишлиста или ответа открыли здесь — на свой экран.
  useEffect(() => {
    if (view && view.kind !== "pick_request") {
      router.replace(shareScreenPath(view, code));
    }
  }, [view, code, router]);

  if (isApiError(share.error) && share.error.code === "NOT_FOUND") {
    return (
      <>
        <TopBar />
        <ScreenBody>
          <BrokenLink closed />
        </ScreenBody>
      </>
    );
  }
  if (share.isError) {
    return (
      <>
        <TopBar />
        <ScreenBody>
          <EmptyState
            className="h-full"
            title="Не получилось открыть ссылку. Проверь связь и попробуй ещё раз."
            action={
              <Button variant="secondary" onClick={() => void share.refetch()}>
                Попробовать ещё раз
              </Button>
            }
          />
        </ScreenBody>
      </>
    );
  }
  if (view?.kind !== "pick_request") return <PickSkeletonBody />;
  return <PickFlow request={view.request} />;
};

const PickContent = () => {
  const params = useSearchParams();
  const code = params?.get("s") ?? "";
  const encoded = params?.get("d") ?? "";
  // Профиль друга появится по «Выбрать подарки» — посчитаем его «из
  // ссылки-фильтра» (Q01). Вне remote значение никуда не уходит.
  useEffect(() => {
    rememberLinkVia("pick_link");
  }, []);
  if (code) return <ShortPickInvite code={code} />;
  return <PickFlow request={decodePickRequest(encoded)} />;
};

// «Выбери подарок сам» — сторона друга (DESIGN.md §8.6): без таб-бара и без
// вопросов на входе — имя только при отправке выбора.
export const PickInvitePage = () => (
  <Screen>
    <Suspense fallback={<PickSkeletonBody />}>
      <PickContent />
    </Suspense>
  </Screen>
);

// Пока ссылка читается или профиль загружается: шапка и скелетон, а не
// логотип по центру (DESIGN.md §6 «Прелоадер»).
const PickSkeletonBody = () => (
  <>
    <TopBar />
    <ScreenBody>
      <ContentSkeleton />
    </ScreenBody>
  </>
);

// Тот же экран до запуска вкладки (app/route-skeleton.tsx).
export const PickInvitePageSkeleton = () => (
  <Screen>
    <PickSkeletonBody />
  </Screen>
);
