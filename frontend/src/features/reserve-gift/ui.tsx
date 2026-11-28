"use client";

import { type ComponentProps, type ReactNode, useState } from "react";

import { Check, ExternalLink, Gift, MessageCircle } from "lucide-react";

import { useAppMode } from "@/shared/lib/app-status";
import { copyText } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";
import { useGuestStore } from "@/shared/store";
import {
  BottomSheet,
  Button,
  DemoLinkNote,
  TextField,
  toast,
  useInAppBrowser,
} from "@/shared/ui";

import {
  type ReserveAccess,
  useCancelReservation,
  useReservations,
  useReserve,
  useReserver,
} from "./api";
import { reservationChatText } from "./model";

// «Сначала имя, потом действие» от features/ask-name (useRequireName): его
// даёт виджет — фичи друг друга не импортируют, а шторка на список одна.
export type NameGuard = {
  handleError: (error: unknown, retry: () => unknown) => boolean;
  run: (action: () => unknown) => void;
};

// Кнопка ряда после брони (UX-аудит Y10): иконка над подписью, три в ряд —
// «Купить», «В календарь», «Сказать в чат». Раньше они шли столбиком, и
// карточка с плашкой гостя выходила выше экрана. Виджет ставит сюда же своё
// «В календарь» (afterBuy).
const reserveActionClassName =
  "rounded-field flex min-h-14 min-w-0 flex-1 basis-0 flex-col items-center justify-center gap-1 px-1 py-1.5 text-center text-[13px] leading-4 font-semibold transition-transform duration-[120ms] active:scale-[0.96]";

export const ReserveActionButton = ({
  className,
  type = "button",
  ...props
}: ComponentProps<"button">) => (
  <button
    type={type}
    className={cn(reserveActionClassName, className)}
    {...props}
  />
);

// Куда идти покупать: самый дешёвый оффер или ссылка своего желания. store —
// для подписи «Купить на AliExpress»; без него — «Где купить».
export type BuyLink = {
  href: string;
  store?: string;
};

type Props = {
  // Как гость открыл вишлист: код короткой ссылки и перечитывание броней по
  // таймеру (remote, B15). У друга из списка не нужно.
  access?: ReserveAccess;
  // В ряду после «Купить» у своей брони — например, «В календарь» (auto-tasks
  // P07, ReserveActionButton). Даёт виджет: фичи друг друга не импортируют.
  afterBuy?: ReactNode;
  // После брони следующий шаг гостя — купить: ссылка в магазин сразу под
  // «Этот подарок выбран тобой» (DESIGN.md §8.5, UX-аудит 27.11.2026, M3).
  buy?: BuyLink;
  // Что и у кого бронь — для «Скопировать для чата» (UX-аудит X01). Только
  // у гостя по ссылке: в демо его бронь не уходит с телефона, и друзьям надо
  // сказать самому. У демо-друзей из списка сказать некому — не передают.
  chat?: { ownerName: string; title: string };
  // В шторке «Подробнее» (UX-аудит G09): только сама бронь — «Забронирую я»
  // или «Этот подарок выбран тобой / Отменить». Ряд «Купить / В календарь /
  // Сказать в чат» остаётся на карточке. Шторка бархатная — цвета под неё.
  compact?: boolean;
  itemKey: string;
  // Профиль без имени — NameSheet, имя сохраняется в профиль (DESIGN.md
  // §8.5); бронь продолжается сама. NAME_REQUIRED от сервера — та же шторка.
  nameGuard: NameGuard;
  // Бронь прошла — виджет показывает следующий шаг гостя («А что хочешь
  // ты?», auto-tasks P01).
  onReserved?: () => void;
  ownerId: string;
};

// Бронь на карточке чужого вишлиста (DESIGN.md §8.5, reference .g-act):
// «Забронирую я» → «Этот подарок выбран тобой» с «Отменить» и «Купить на …»;
// у других гостей — «Кто-то уже выбрал»; подаренное желание у
// забронировавшего — «Уже подарено». Тексты без рода: гость может быть кем
// угодно (UX-аудит, L4).
export const ReserveControl = ({
  access,
  ownerId,
  itemKey,
  nameGuard,
  buy,
  onReserved,
  afterBuy,
  chat,
  compact = false,
}: Props) => {
  const reserver = useReserver();
  // В «Локальной сети» брони общие — подпись и кнопка не нужны.
  const demoOnly = useAppMode() === "local";
  // Во встроенном браузере рядом ещё «Скопировать ссылку для Chrome» —
  // кнопка для чата называет, что именно она скопирует (Y10).
  const inApp = useInAppBrowser() !== null;
  const reservations = useReservations(ownerId, access);
  const reserve = useReserve(ownerId, access);
  const cancel = useCancelReservation(ownerId);
  const setGuestName = useGuestStore((state) => state.setName);
  const [askName, setAskName] = useState(false);
  const [name, setName] = useState("");

  const { state, id } = reservations.stateOf(itemKey);

  // Гость без профиля называется только для брони (как было), профиль —
  // через NameSheet. Имя профиля сервер берёт сам.
  const reserveAs = (guestName?: string) =>
    reserve.mutate(
      { itemKey, name: guestName },
      {
        onSuccess: () => onReserved?.(),
        onError: (error) =>
          nameGuard.handleError(error, () => reserveAs(guestName)),
      },
    );

  const handleReserve = () => {
    if (reserver.needsName) {
      setAskName(true);
      return;
    }
    if (reserver.isGuest) reserveAs(reserver.name);
    else nameGuard.run(() => reserveAs());
  };

  const handleName = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setGuestName(trimmed);
    setAskName(false);
    reserveAs(trimmed);
  };

  // «Уже подарено» и «Кто-то уже выбрал»: пунктир цвета текста — на бумаге
  // карточки серый, на бархате шторки розовый.
  const dashed = cn(
    "rounded-field flex min-h-12 items-center justify-center gap-2 border-[1.5px] border-dashed text-[15px] leading-5 font-semibold",
    compact ? "border-rose/45 text-rose" : "border-ink-soft/45 text-ink-soft",
  );

  if (state === "closed") {
    return (
      <div className={dashed}>
        <Gift aria-hidden size={18} strokeWidth={1.75} />
        Уже подарено
      </div>
    );
  }

  if (state === "taken") {
    return <div className={dashed}>Кто-то уже выбрал</div>;
  }

  if (state === "mine") {
    return (
      <div className="flex flex-col items-center gap-1.5">
        <div className="bg-paper-2 rounded-field text-ink flex min-h-12 w-full items-center justify-between gap-2 pr-1.5 pl-3.5 text-[15px] leading-5 font-semibold">
          <span className="flex items-center gap-2">
            <Check aria-hidden size={18} strokeWidth={2} />
            Этот подарок выбран тобой
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="text-ink-soft"
            loading={cancel.isPending}
            onClick={() => id && cancel.mutate(id)}
          >
            Отменить
          </Button>
        </div>
        {!compact && (
          <div className="flex w-full gap-1">
            {buy && (
              // «Мандарин-чернила», а не мандарин: на бумаге светлый мандарин
              // нечитаем, а главная кнопка этой карточки уже не нужна. Магазин —
              // в имени ссылки: в ряду из трёх на 360 px «Купить на kivano.kg»
              // не помещается.
              <a
                href={buy.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={buy.store ? `Купить на ${buy.store}` : "Где купить"}
                className={cn(reserveActionClassName, "text-mandarin-ink")}
              >
                <ExternalLink aria-hidden size={20} strokeWidth={2} />
                {buy.store ? "Купить" : "Где купить"}
              </a>
            )}
            {afterBuy}
            {chat && demoOnly && (
              // Сказать друзьям — после «Купить» (M3): следующий шаг после
              // брони всё ещё купить.
              <ReserveActionButton
                className="text-ink"
                onClick={() =>
                  void copyText(reservationChatText(chat)).then((ok) =>
                    toast(
                      ok
                        ? "Текст скопирован — отправь его в чат"
                        : "Не получилось скопировать",
                      { tone: ok ? "success" : "error" },
                    ),
                  )
                }
              >
                <MessageCircle aria-hidden size={20} strokeWidth={2} />
                {inApp ? "Написать в чат, что беру" : "Сказать в чат"}
              </ReserveActionButton>
            )}
          </div>
        )}
        {!compact && chat && demoOnly && (
          <DemoLinkNote className="text-ink-soft px-2 text-center">
            В демо бронь видна только здесь
          </DemoLinkNote>
        )}
      </div>
    );
  }

  return (
    <>
      <Button
        className="w-full"
        loading={reserve.isPending || reservations.isLoading}
        onClick={handleReserve}
      >
        Забронирую я
      </Button>
      <BottomSheet
        open={askName}
        onClose={() => setAskName(false)}
        title="Как тебя зовут?"
        footer={
          <Button size="lg" disabled={!name.trim()} onClick={handleName}>
            Забронировать
          </Button>
        }
      >
        <p className="text-body text-rose mb-4">
          Имя увидит только тот, кто тоже бронирует. Владелец вишлиста не
          узнает, кто что выбрал.
        </p>
        <TextField
          label="Имя"
          autoFocus
          maxLength={40}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") handleName();
          }}
        />
      </BottomSheet>
    </>
  );
};
