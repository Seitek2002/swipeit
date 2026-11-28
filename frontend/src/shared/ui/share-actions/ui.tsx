"use client";

import { type ReactNode, useRef, useState } from "react";

import { Copy, QrCode as QrIcon, Share2 } from "lucide-react";

import {
  type SharePayload,
  canNativeShare,
  copyText,
  shareNative,
} from "@/shared/lib/dom";
import { useMounted } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";

import { QrCode } from "../qr-code";
import { toast } from "../toast";

type Props = {
  // «Скопировать» кладёт текст вместе со ссылкой — для сообщения в чат
  // («Жеребьёвка прошла: …», Q06), а не только ссылку.
  copyWithText?: boolean;
  // Ссылка собирается по требованию: перед отправкой сохраняется повод,
  // сообщение и т. п.
  getPayload: () => Promise<SharePayload>;
  // Ошибку, которую экран разбирает сам (NAME_REQUIRED → спросить имя),
  // он забирает себе: вернул true — тоста нет, retry повторяет нажатие.
  onError?: (error: unknown, retry: () => void) => boolean;
  qrLabel: string;
  // На экране уже есть своя главная кнопка (лобби: «Поехали» / «Готов») —
  // тогда и первая кнопка отправки вторичная: мандарин один (DESIGN.md §1).
  secondary?: boolean;
};

const ICON = { size: 22, strokeWidth: 1.75, "aria-hidden": true } as const;

// Кнопки отправки — ряд круглых иконок 56px с подписями (DESIGN.md §8.4,
// эталон — quick-start.html, кадр 4; решение владельца от 27.11.2026:
// Telegram и WhatsApp убраны — они есть в «Поделиться»). Первая — мандарин,
// если на экране нет своей главной кнопки. Подпись короткая, полное
// название — в aria-label: он начинается с видимой подписи (axe
// label-content-name-mismatch).
const CIRCLE =
  "grid size-14 place-items-center rounded-full transition-transform duration-[120ms] group-active:scale-[0.94]";
const PRIMARY =
  "bg-mandarin text-ink shadow-[0_10px_24px_-10px_rgb(255_138_61/0.6)]";
const SECONDARY = "bg-velvet-3 text-paper";

type ButtonProps = {
  busy: boolean;
  caption: string;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  primary: boolean;
};

const ShareButton = ({
  busy,
  caption,
  icon,
  label,
  onClick,
  pressed,
  primary,
}: ButtonProps) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={pressed}
    aria-disabled={busy || undefined}
    onClick={onClick}
    className="group text-rose flex min-w-[72px] flex-col items-center gap-1.5 select-none aria-disabled:pointer-events-none aria-disabled:opacity-40"
  >
    <span className={cn(CIRCLE, primary ? PRIMARY : SECONDARY)}>{icon}</span>
    <span aria-hidden className="text-caption whitespace-nowrap">
      {caption}
    </span>
  </button>
);

// Код появился — прокрутить к нему; без анимации, если её просили убрать.
const revealQr = (node: HTMLDivElement | null) => {
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({
    block: "nearest",
    behavior: reduce ? "auto" : "smooth",
  });
};

export const ShareActions = ({
  getPayload,
  onError,
  qrLabel,
  secondary = false,
  copyWithText = false,
}: Props) => {
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  // Не disabled: выключенная кнопка теряет фокус, он падает на <body>, и
  // Escape больше не закрывает шторку. Повторное нажатие отсекаем здесь.
  const busyRef = useRef(false);
  const [qrUrl, setQrUrl] = useState<null | string>(null);
  const native = mounted && canNativeShare();

  // fail — убрать то, что нажатие успело открыть; again — как повторить
  // нажатие, когда экран разобрал ошибку сам (onError).
  const run = async (
    action: (payload: SharePayload) => Promise<void> | void,
    { fail, again }: { again?: () => void; fail?: () => void } = {},
  ) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action(await getPayload());
    } catch (error) {
      fail?.();
      const retry = again ?? (() => void run(action));
      if (onError?.(error, retry)) return;
      toast("Не получилось собрать ссылку", {
        tone: "error",
        action: { label: "Повторить", onClick: retry },
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const copy = () =>
    void run(async (payload) => {
      const ok = await copyText(
        copyWithText && payload.text
          ? `${payload.text} ${payload.url}`
          : payload.url,
      );
      const done = copyWithText
        ? "Текст со ссылкой скопирован"
        : "Ссылка скопирована";
      toast(ok ? done : "Не получилось скопировать", {
        tone: ok ? "success" : "error",
      });
    });

  // Главная — первая кнопка ряда, если на экране нет своей главной.
  const primaryFirst = !secondary;

  return (
    <div className="flex flex-col gap-2">
      <div className="mt-5 mb-2 flex justify-center gap-4">
        {native && (
          <ShareButton
            label="Поделиться"
            caption="Поделиться"
            icon={<Share2 {...ICON} />}
            primary={primaryFirst}
            busy={busy}
            onClick={() =>
              void run((payload) => shareNative(payload).then(() => undefined))
            }
          />
        )}
        <ShareButton
          label="Скопировать ссылку"
          caption="Скопировать"
          icon={<Copy {...ICON} />}
          primary={!native && primaryFirst}
          busy={busy}
          onClick={copy}
        />
        <ShareButton
          label={qrUrl ? "Скрыть QR-код" : "Показать QR-код"}
          caption="QR-код"
          icon={<QrIcon {...ICON} />}
          primary={false}
          pressed={Boolean(qrUrl)}
          busy={busy}
          onClick={() =>
            qrUrl
              ? setQrUrl(null)
              : void run((payload) => setQrUrl(payload.url))
          }
        />
      </div>
      {qrUrl && (
        // Кнопки — внизу шторки, и код появлялся за краем экрана: выглядело
        // как «не нажалось» (auto-tasks U06). Показываем его целиком.
        <div ref={revealQr}>
          <QrCode
            value={qrUrl}
            label={qrLabel}
            className="mx-auto mt-2 size-56"
          />
        </div>
      )}
    </div>
  );
};
