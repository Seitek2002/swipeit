"use client";

import { useRef, useState } from "react";

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

const ICON = { size: 24, strokeWidth: 1.75, "aria-hidden": true } as const;

// Кнопки отправки — ряд круглых иконок (решение владельца от 27.11.2026:
// экономим место, Telegram и WhatsApp убраны — они есть в «Поделиться»):
// «Поделиться» (где есть системное), «Скопировать ссылку», «Показать QR».
// Первая — главная. Подпись — в aria-label и title.
const ROUND =
  "grid size-14 place-items-center rounded-full transition-[transform,opacity] duration-[120ms] select-none active:scale-[0.94] aria-disabled:pointer-events-none aria-disabled:opacity-40";
const PRIMARY =
  "bg-mandarin text-ink shadow-[0_8px_20px_-6px_rgb(255_138_61/0.6)]";
const SECONDARY = "bg-velvet-3 text-paper";
export const ShareActions = ({
  getPayload,
  onError,
  qrLabel,
  secondary = false,
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
      const ok = await copyText(payload.url);
      toast(ok ? "Ссылка скопирована" : "Не получилось скопировать", {
        tone: ok ? "success" : "error",
      });
    });

  // Главная — первая кнопка ряда, если на экране нет своей главной.
  const firstTone = secondary ? SECONDARY : PRIMARY;
  const qrLabelText = qrUrl ? "Скрыть QR" : "Показать QR";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-center gap-5">
        {native && (
          <button
            type="button"
            aria-label="Поделиться"
            title="Поделиться"
            aria-disabled={busy || undefined}
            className={cn(ROUND, firstTone)}
            onClick={() =>
              void run((payload) => shareNative(payload).then(() => undefined))
            }
          >
            <Share2 {...ICON} />
          </button>
        )}
        <button
          type="button"
          aria-label="Скопировать ссылку"
          title="Скопировать ссылку"
          aria-disabled={busy || undefined}
          className={cn(ROUND, native ? SECONDARY : firstTone)}
          onClick={copy}
        >
          <Copy {...ICON} />
        </button>
        <button
          type="button"
          aria-label={qrLabelText}
          title={qrLabelText}
          aria-pressed={Boolean(qrUrl)}
          aria-disabled={busy || undefined}
          className={cn(ROUND, SECONDARY)}
          onClick={() =>
            qrUrl
              ? setQrUrl(null)
              : void run((payload) => setQrUrl(payload.url))
          }
        >
          <QrIcon {...ICON} />
        </button>
      </div>
      {qrUrl && (
        <QrCode
          value={qrUrl}
          label={qrLabel}
          className="mx-auto mt-2 size-56"
        />
      )}
    </div>
  );
};
