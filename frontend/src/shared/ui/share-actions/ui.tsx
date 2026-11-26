"use client";

import { useState } from "react";

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
  qrLabel: string;
};

const ICON = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

// Кнопки отправки (DESIGN.md §8.4): «Поделиться» (где есть системное),
// Telegram, WhatsApp, «Скопировать ссылку», «Показать QR». Первая — главная.
export const ShareActions = ({ getPayload, qrLabel }: Props) => {
  const mounted = useMounted();
  const [busy, setBusy] = useState(false);
  const [qrUrl, setQrUrl] = useState<null | string>(null);
  const native = mounted && canNativeShare();

  const run = async (
    action: (payload: SharePayload) => Promise<void> | void,
  ) => {
    setBusy(true);
    try {
      await action(await getPayload());
    } catch {
      toast("Не получилось собрать ссылку. Попробуй ещё раз", {
        tone: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  // Мессенджер — в новой вкладке. Окно открываем до await: иначе браузер
  // заблокирует его как всплывающее.
  const openMessenger = (build: (payload: SharePayload) => string) => {
    // Без "noopener" в параметрах: с ним window.open всегда возвращает null.
    // Связь с нашей вкладкой обрываем вручную.
    const opened = window.open("about:blank", "_blank");
    if (opened) opened.opener = null;
    void run((payload) => {
      const url = build(payload);
      if (opened) opened.location.href = url;
      else window.location.href = url;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {native && (
        <Button
          size="lg"
          disabled={busy}
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
        variant={native ? "secondary" : "primary"}
        disabled={busy}
        icon={<Send {...ICON} />}
        onClick={() => openMessenger(telegramUrl)}
      >
        Отправить в Telegram
      </Button>
      <Button
        size="lg"
        variant="secondary"
        disabled={busy}
        onClick={() => openMessenger(whatsappUrl)}
      >
        Отправить в WhatsApp
      </Button>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          disabled={busy}
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
          disabled={busy}
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
