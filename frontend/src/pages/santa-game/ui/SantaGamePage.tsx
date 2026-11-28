"use client";

import { Suspense, useEffect, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Check, Gift } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";
import { SantaEnvelope } from "@/widgets/santa-envelope";
import { useSantaNudge } from "@/widgets/santa-nudge";

import { buildIcs, dayOf, downloadIcs } from "@/features/calendar-export";
import { SantaDrawButton } from "@/features/santa-draw";

import {
  InviteFriendsButton,
  type SantaView,
  drawFailedNote,
  drawLabel,
  gatheringIssue,
  needsMoreMembers,
  santaInviteText,
  santaTerms,
  useSantaGame,
} from "@/entities/santa-game";

import {
  isApiError,
  joinSantaGame,
  openSantaEnvelope,
  santaKeys,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock } from "@/shared/lib/clock";
import { inviteUrl, usePrefetchInvite } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useSessionStore } from "@/shared/store";
import {
  Avatar,
  Button,
  ContentSkeleton,
  DemoLinkNote,
  EmptyState,
  Screen,
  ScreenBody,
  ShareActions,
  Skeleton,
  buttonClassName,
  toast,
} from "@/shared/ui";

import { remindWishlistNames } from "../model/letters";
import {
  ASK_OWNER_TO_REMOVE,
  canRemoveMember,
  leaveAction,
} from "../model/member-actions";
import { type MemberStatus, memberStatus } from "../model/member-status";
import {
  STALE_LETTERS_HINT,
  sealedLetterText,
  staleLetters,
} from "../model/stale-letters";
import { BoughtSection } from "./BoughtSheet";
import { EditGameAction, EditGameLink } from "./EditGame";
import { Exclusions } from "./Exclusions";
import { LettersReady } from "./LettersReady";
import {
  HandOverButton,
  LeaveGameButton,
  RemoveMemberButton,
} from "./MemberActions";
import { RemindWithoutWishlist } from "./RemindWithoutWishlist";
import { WardWishlist } from "./WardWishlist";

// Готово — мятной галочкой, ждём — пыльной розой (DESIGN.md §8.8).
const MemberStatusCell = ({
  status,
  staleDays,
}: {
  // Сколько дней письмо не открыто — у организатора (S04).
  staleDays?: number;
  status: MemberStatus;
}) => {
  switch (status) {
    case "collect":
      return (
        <Link
          href={ROUTES.GIFTS}
          className={buttonClassName({ size: "sm", variant: "secondary" })}
        >
          Собрать вишлист
        </Link>
      );
    case "invited":
      return <span className="text-caption text-rose">ещё не в игре</span>;
    case "letter-opened":
    case "wishlist-ready":
      return (
        <span className="text-caption text-mint inline-flex items-center gap-1">
          <Check aria-hidden size={16} strokeWidth={2.25} />
          {status === "letter-opened" ? "письмо открыто" : "вишлист готов"}
        </span>
      );
    case "letter-sealed":
      return (
        <span className="text-caption text-rose text-right">
          {sealedLetterText(staleDays)}
        </span>
      );
    case "no-wishlist":
      return <span className="text-caption text-rose">без вишлиста</span>;
  }
};

// Участники со статусами (DESIGN.md §8.8): до жеребьёвки — вишлист, после —
// письмо (X08); у себя — «Собрать вишлист». Организатору после жеребьёвки —
// сколько дней письмо не открыто (S04): потерянный профиль так видно.
const Members = ({ view, meId }: { meId: string; view: SantaView }) => {
  const joined = view.members.filter((member) => member.joined);
  const stale =
    view.role === "owner"
      ? staleLetters(view, clock.now())
      : new Map<string, number>();
  stale.delete(meId);
  const invited = view.members.filter((member) => !member.joined);
  const drawn = view.game.status === "drawn";
  // Мне мало желаний в бюджете этой игры (R06) — подсказка в моей строке.
  const nudge = useSantaNudge();
  const needWishes = nudge?.gameId === view.game.id;
  return (
    <section>
      <h2 className="text-label mb-1">
        Участники <span className="text-rose">{joined.length}</span>
      </h2>
      {drawn && (
        // Кому напомнить (Q06): кто открыл письмо — видно всем, пар — нет.
        <p className="text-caption text-rose mb-1">
          Открыли письмо: {view.openedCount} из {joined.length}
        </p>
      )}
      {stale.size > 0 && (
        <p className="text-caption text-rose mb-1">{STALE_LETTERS_HINT}</p>
      )}
      <ul>
        {[...joined, ...invited].map((member) => (
          <li
            key={member.id}
            className="border-line flex min-h-[56px] items-center gap-3 border-b"
          >
            <Avatar
              name={member.name}
              color={member.avatarColor}
              size={36}
              decorative
            />
            <span className="text-body text-paper min-w-0 flex-1 font-semibold">
              {member.id === meId ? "Ты" : member.name}
              {member.id === meId && member.joined && needWishes && (
                <span className="text-caption text-rose block font-normal">
                  Собери вишлист, чтобы твоему Санте было проще
                </span>
              )}
            </span>
            <MemberStatusCell
              status={memberStatus(member, {
                drawn,
                isMe: member.id === meId,
                needWishes,
              })}
              staleDays={stale.get(member.id)}
            />
            {canRemoveMember(view, meId, member.id) && (
              <RemoveMemberButton view={view} member={member} />
            )}
          </li>
        ))}
      </ul>
      {view.game.status === "drawn" && (
        <p className="text-caption text-rose mt-3 inline-flex items-center gap-1.5">
          <Gift aria-hidden size={16} strokeWidth={1.75} />
          Подарок купили: {view.boughtCount} из {joined.length}
        </p>
      )}
    </section>
  );
};

const GameContent = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useSearchParams()?.get("id") ?? undefined;
  const meId = useSessionStore((state) => state.activeUserId);
  const game = useSantaGame(id);
  const view = game.data;

  // Чужой по ссылке — на экран приглашения.
  useEffect(() => {
    if (id && view?.role === "guest") router.replace(ROUTES.SANTA_JOIN(id));
  }, [id, view?.role, router]);
  // «Позвать по ссылке» — до жеребьёвки, у тех, кто в игре или позван.
  usePrefetchInvite(
    "santa",
    id ?? "",
    Boolean(id) && view?.game.status === "gathering" && view.role !== "guest",
  );

  const save = (next: SantaView) => {
    queryClient.setQueryData(santaKeys.detail(id ?? ""), next);
    void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
  };
  const open = useMutation({
    mutationFn: () => openSantaEnvelope(id ?? ""),
    onSuccess: save,
    onError: () => toast("Не получилось открыть письмо", { tone: "error" }),
  });
  // Шторка «Эти двое не дарят друг другу»: её открывает и секция
  // «Исключения», и подтверждение жеребьёвки (Y04).
  const [pairOpen, setPairOpen] = useState(false);
  const join = useMutation({
    mutationFn: () => joinSantaGame(id ?? ""),
    onSuccess: (next) =>
      queryClient.setQueryData(santaKeys.detail(id ?? ""), next),
    onError: (error) =>
      toast(isApiError(error) ? error.message : "Не получилось вступить", {
        tone: "error",
      }),
  });

  if (!id || (isApiError(game.error) && game.error.code === "NOT_FOUND")) {
    return (
      <EmptyState
        className="h-full"
        object="envelope"
        title="Такой игры нет."
      />
    );
  }
  if (game.isError) {
    return (
      <EmptyState
        className="h-full"
        object="envelope"
        title="Не получилось загрузить игру. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void game.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!view || !meId || view.role === "guest") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton tone="paper" className="h-52 rounded-[22px]" />
      </div>
    );
  }

  const isOwner = view.role === "owner";
  // Кому напомнить про вишлист — без того, кто нажимает (Y07).
  const remindNames = remindWishlistNames(view.members, meId);
  // Вступивших меньше трёх (Y06) — главное действие «Позвать друзей».
  const moreMembers = needsMoreMembers(view);
  const envelope = view.me?.envelope ?? "sealed";
  // Жеребьёвка по дате не прошла (R08): организатору — почему и что
  // делать, остальным — что ждём его.
  const failedNote = drawFailedNote(view);
  // Почему тянуть пары ещё нельзя: у организатора — с сервера, у остальных
  // — по составу (S05: причины с исключениями видит только организатор).
  const issue = gatheringIssue(view);
  // «Выйти из игры» до жеребьёвки или подпись «напиши организатору» после
  // (R05): выйти самому после неё нельзя — подопечный остался бы без подарка.
  const leave = leaveAction(view);
  // Подопечный приходит сразу после жеребьёвки, но показываем только во
  // вскрытом конверте — анимация не ждёт сети.
  const ward = envelope === "opened" ? (view.me?.ward ?? null) : null;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <p className="text-title-2">{view.game.title}</p>
        <p className="text-caption text-rose mt-0.5">{santaTerms(view.game)}</p>
        {/* День обмена — в календарь телефона (auto-tasks P07): уведомлений
            в первой версии нет, событие — бесплатное напоминание. */}
        <button
          type="button"
          onClick={() => {
            const now = clock.now();
            downloadIcs(
              "swipeit-santa.ics",
              buildIcs(
                {
                  uid: `santa-${view.game.id}`,
                  title: `Тайный Санта «${view.game.title}»`,
                  start: dayOf(view.game.exchangeDate),
                  allDay: true,
                  durationMinutes: 60,
                  description: `Обмен подарками. ${santaTerms(view.game)}`,
                },
                now,
              ),
            );
          }}
          className="text-rose -ml-1 mt-1 flex min-h-11 items-center gap-1.5 px-1 text-[15px] leading-5 font-semibold"
        >
          <CalendarPlus aria-hidden size={16} strokeWidth={2} />
          Добавить в календарь
        </button>
      </div>
      {/* Жеребьёвка прошла без меня — конверта у меня нет. */}
      {(view.game.status === "gathering" || view.me) && (
        <SantaEnvelope
          state={envelope}
          onOpen={() => open.mutate()}
          letter={
            ward && (
              <>
                <p className="text-caption text-ink-soft">
                  Ты Тайный Санта для
                </p>
                <p className="text-display mt-1 italic">{ward.name}</p>
                <p className="text-caption text-ink-soft mt-1.5">
                  Вишлист:{" "}
                  {pluralize(ward.wishlist.length, [
                    "желание",
                    "желания",
                    "желаний",
                  ])}
                  , {ward.wishlist.length - ward.overBudgetCount} в бюджете
                </p>
              </>
            )
          }
        />
      )}
      <div className="-mt-2 flex flex-col items-center gap-3 text-center">
        {view.game.status === "gathering" && (
          <>
            <p className="text-title-3">{drawLabel(view)}</p>
            {failedNote && (
              // Две строки над таб-баром на 360×640 (Y09): почему и что
              // делать, «Изменить игру» — та же шторка, что в шапке.
              <p className="text-caption text-rose">
                {failedNote}
                {isOwner && (
                  <>
                    {" — "}
                    <EditGameLink view={view} />
                  </>
                )}
              </p>
            )}
            {moreMembers ? (
              <InviteFriendsButton game={view.game} />
            ) : (
              isOwner && (
                <SantaDrawButton
                  view={view}
                  meId={meId}
                  onAddExclusion={() => setPairOpen(true)}
                />
              )
            )}
            {view.role === "invited" ? (
              <Button
                size="lg"
                loading={join.isPending}
                onClick={() => join.mutate()}
              >
                Вступить в игру
              </Button>
            ) : (
              // Без даты причина уже в строке выше — не повторяем (W09).
              // Жеребьёвка по дате не прошла — причина уже в подписи R08.
              issue &&
              view.game.drawAt &&
              !failedNote && <p className="text-caption text-rose">{issue}</p>
            )}
          </>
        )}
        {view.me?.wardLeft && (
          // Подопечный удалил профиль, а дарил мне (пара двоих, Q05).
          <p className="text-body text-rose">
            Твой подопечный вышел из игры — в этой игре ты не даришь.
          </p>
        )}
        {envelope === "ready" && !view.me?.wardLeft && (
          <>
            <p className="text-caption text-rose">
              Удерживай печать, чтобы открыть
            </p>
            <Button
              size="lg"
              variant="ghost"
              loading={open.isPending}
              onClick={() => open.mutate()}
            >
              Открыть письмо
            </Button>
          </>
        )}
        {view.game.status === "drawn" && !view.me && (
          <p className="text-caption text-rose">
            Жеребьёвка прошла без тебя — в этой игре ты не участвуешь.
          </p>
        )}
      </div>

      {envelope === "opened" && ward && (
        <>
          <WardWishlist
            items={ward.wishlist}
            name={ward.name}
            budget={view.game.budget}
          />
          {/* «Что купил?» (X02, Y05): выбранное желание бронируется —
              друзья подопечного не купят второе такое же. */}
          <BoughtSection view={view} items={ward.wishlist} />
        </>
      )}

      <Members view={view} meId={meId} />

      {isOwner && view.game.status === "gathering" && (
        <Exclusions
          view={view}
          meId={meId}
          pairOpen={pairOpen}
          onPairOpenChange={setPairOpen}
        />
      )}

      {view.game.status === "drawn" && view.me && (
        <LettersReady view={view} isOwner={isOwner} meId={meId} />
      )}

      {view.game.status === "gathering" && (
        <section className="flex flex-col gap-3">
          {isOwner && remindNames.length > 0 && (
            <RemindWithoutWishlist view={view} names={remindNames} />
          )}
          <p className="text-label">Позвать по ссылке</p>
          <ShareActions
            getPayload={async () => ({
              title: view.game.title,
              text: santaInviteText(view.game),
              url: await inviteUrl("santa", view.game.id),
            })}
            qrLabel="QR-код приглашения в игру"
            // Выше уже главная кнопка — «Провести жеребьёвку» или «Позвать
            // друзей» (Y06) у организатора, «Позвать друзей» у участника,
            // «Вступить в игру» у приглашённого: мандарин один (DESIGN.md §1).
            secondary={isOwner || moreMembers || view.role === "invited"}
          />
          <DemoLinkNote />
          {leave === "leave" && <LeaveGameButton view={view} />}
        </section>
      )}

      {leave === "ask-owner" && (
        <p className="text-caption text-rose text-center">
          {ASK_OWNER_TO_REMOVE}
        </p>
      )}

      {/* Потерял телефон или уезжает — игру ведёт другой (S04). */}
      {isOwner && <HandOverButton view={view} meId={meId} />}
    </div>
  );
};

// Экран игры Тайного Санты (DESIGN.md §8.8): конверт — главный объект,
// ниже участники со статусами вишлиста.
export const SantaGamePage = () => (
  <Screen>
    <AppHeader
      title="Тайный Санта"
      showBack
      backHref={ROUTES.SANTA}
      actions={
        // Свой Suspense: шапка вне Suspense экрана, а «Изменить игру» читает
        // id из адреса (useSearchParams).
        <Suspense fallback={null}>
          <EditGameAction />
        </Suspense>
      }
    />
    <ScreenBody className={cn("px-5 pt-2")}>
      <Suspense fallback={<ContentSkeleton />}>
        <GameContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
