"use client";

import { Suspense, useState } from "react";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";

import { GiftDeck } from "@/widgets/gift-deck";

import { ActiveFilterChips, describeFilters } from "@/features/product-filters";

import { useMe } from "@/entities/user";

import { getMyPicks, pickKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { dative, genitive, occasionLabel, plural } from "@/shared/lib/format";
import {
  type SharedPickRequest,
  decodePickRequest,
} from "@/shared/lib/share-codec";
import { useSessionStore } from "@/shared/store";
import {
  Avatar,
  Brand,
  BrokenLink,
  Button,
  IconButton,
  Screen,
  ScreenBody,
  Splash,
} from "@/shared/ui";

import { NameSheet } from "./NameSheet";
import { SendPicksSheet } from "./SendPicksSheet";

// Столько «Хочу» нужно, чтобы отправить выбор (DESIGN.md §8.6: «после 3+»).
export const MIN_PICKS = 3;

const TopBar = ({ onBack }: { onBack?: () => void }) => (
  <div className="flex h-[52px] flex-none items-center gap-1 px-5">
    {onBack && (
      <IconButton label="Назад" className="-ml-3" onClick={onBack}>
        <ChevronLeft aria-hidden size={26} strokeWidth={1.75} />
      </IconButton>
    )}
    <Link href={ROUTES.HOME} aria-label="SwipeIt">
      <Brand size="sm" />
    </Link>
  </div>
);

// Приглашение (DESIGN.md §8.6): «Азамат хочет подарить тебе подарок»,
// условия курсивом, повод и сообщение.
const Invite = ({
  request,
  isMine,
  onStart,
}: {
  isMine: boolean;
  onStart: () => void;
  request: SharedPickRequest;
}) => {
  const occasion = occasionLabel(request.occasion);
  const to = dative(request.from.name, request.from.gender);
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
        {request.message && (
          <p className="text-body bg-velvet-2 text-paper mt-4 rounded-[14px_14px_14px_4px] px-3.5 py-3">
            {request.message}
          </p>
        )}
        <ol className="text-body text-rose mt-5 flex list-inside list-decimal flex-col gap-1.5 pb-6">
          <li>Свайпай вправо то, что нравится, влево — мимо.</li>
          <li>Выбери хотя бы три подарка.</li>
          <li>Отправь выбор {to}.</li>
        </ol>
      </ScreenBody>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {isMine && (
          <p className="text-caption text-rose mb-2.5 text-center">
            Это твоя ссылка — так её увидит друг.
          </p>
        )}
        <Button size="lg" className="w-full" onClick={onStart}>
          Выбрать подарки
        </Button>
      </div>
    </>
  );
};

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
  const picks = useQuery({
    queryKey: pickKeys.picks(request.id),
    queryFn: () => getMyPicks(request.id),
  });
  const count = picks.data?.picks.length ?? 0;
  const left = Math.max(0, MIN_PICKS - count);

  return (
    <>
      <TopBar onBack={onBack} />
      <p className="text-caption text-rose flex-none px-5">
        Подарок от {genitive(request.from.name, request.from.gender)}
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
      />
      <div className="flex min-h-[72px] flex-none flex-col justify-center px-5 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        {left > 0 ? (
          <p className="text-caption text-rose text-center" aria-live="polite">
            {count === 0
              ? "Выбери хотя бы три подарка"
              : `Ещё ${left} ${plural(left, ["подарок", "подарка", "подарков"])} — и можно отправить`}
          </p>
        ) : (
          <Button
            size="lg"
            className="w-full"
            onClick={() => setSendOpen(true)}
          >
            Отправить выбор {dative(request.from.name, request.from.gender)}
          </Button>
        )}
      </div>
      <SendPicksSheet
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        request={request}
        count={count}
      />
    </>
  );
};

const PickContent = () => {
  const encoded = useSearchParams()?.get("d") ?? "";
  const request = decodePickRequest(encoded);
  const activeUserId = useSessionStore((state) => state.activeUserId);
  const me = useMe();
  const [view, setView] = useState<"invite" | "swipe" | null>(null);
  const [askName, setAskName] = useState(false);
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
  if (activeUserId && !me.data && !me.isError) return <Splash />;

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
        onStart={() => (me.data ? setView("swipe") : setAskName(true))}
      />
      <NameSheet
        open={askName}
        senderName={request.from.name}
        onClose={() => setAskName(false)}
        onDone={() => {
          setAskName(false);
          setView("swipe");
        }}
      />
    </>
  );
};

// «Выбери подарок сам» — сторона друга (DESIGN.md §8.6): без таб-бара и без
// полной регистрации — достаточно имени.
export const PickInvitePage = () => (
  <Screen>
    <Suspense fallback={<Splash />}>
      <PickContent />
    </Suspense>
  </Screen>
);
