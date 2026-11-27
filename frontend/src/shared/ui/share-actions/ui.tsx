"use client";

import { useRef, useState } from "react";

import { Copy, QrCode as QrIcon, Send, Share2 } from "lucide-react";

import {
  type SharePayload,
  canNativeShare,
  copyText,
  shareNative,
  telegramUrl,
  whatsappUrl,
} from "@/shared/lib/dom";
import { useMounted } from "@/shared/lib/dom";

import { Button } from "../button";
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

const ICON = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

// Кнопки отправки (DESIGN.md §8.4): «Поделиться» (где есть системное),
// Telegram, WhatsApp, «Скопировать ссылку», «Показать QR». Первая — главная.
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
      if (onError?.(error, again ?? (() => void run(action)))) return;
      toast("Не получилось собрать ссылку. Попробуй ещё раз", {
        tone: "error",
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  // Мессенджер — в новой вкладке. Окно открываем до await: иначе браузер
  // заблокирует его как всплывающее. Ссылка не собралась — пустую вкладку
  // закрываем, иначе человек остаётся в ней, а шторка с ошибкой — здесь.
  const openMessenger = (build: (payload: SharePayload) => string) => {
    if (busyRef.current) return;
    // Без "noopener" в параметрах: с ним window.open всегда возвращает null.
    // Связь с нашей вкладкой обрываем вручную.
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    void run(
      (payload) => {
        const url = build(payload);
        if (opened && !opened.closed) opened.location.href = url;
        else window.location.href = url;
      },
      { fail: () => opened?.close(), again: () => openMessenger(build) },
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {native && (
        <Button
          size="lg"
          variant={secondary ? "secondary" : "primary"}
          aria-disabled={busy || undefined}
          icon={<Share2 {...ICON} />}
          onClick={() =>
            void run((payload) => shareNative(payload).then(() => undefined))
          }
        >
          Поделиться
        </Button>
      )}
      <Button
        size="lg"
        variant={native || secondary ? "secondary" : "primary"}
        aria-disabled={busy || undefined}
        icon={<Send {...ICON} />}
        onClick={() => openMessenger(telegramUrl)}
      >
        Отправить в Telegram
      </Button>
      <Button
        size="lg"
        variant="secondary"
        aria-disabled={busy || undefined}
        onClick={() => openMessenger(whatsappUrl)}
      >
        Отправить в WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          icon={<Copy {...ICON} />}
          onClick={() =>
            void run(async (payload) => {
              const ok = await copyText(payload.url);
              toast(ok ? "Ссылка скопирована" : "Не получилось скопировать", {
                tone: ok ? "success" : "error",
              });
            })
          }
        >
          Скопировать
        </Button>
        <Button
          variant="secondary"
          aria-disabled={busy || undefined}
          icon={<QrIcon {...ICON} />}
          onClick={() =>
            qrUrl
              ? setQrUrl(null)
              : void run((payload) => setQrUrl(payload.url))
          }
        >
          {qrUrl ? "Скрыть QR" : "Показать QR"}
        </Button>
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
