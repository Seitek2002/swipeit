"use client";

import { useRef, useState } from "react";

import { UserPlus } from "lucide-react";

import { clock } from "@/shared/lib/clock";
import {
  canNativeShare,
  copyText,
  inviteUrl,
  shareNative,
  usePrefetchInvite,
} from "@/shared/lib/dom";
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
  toast,
} from "@/shared/ui";

import { type SantaView, santaInviteText } from "../model";

type Props = {
  // Полное название, если кнопок на экране несколько (список игр): должно
  // начинаться с видимой подписи (axe label-content-name-mismatch).
  ariaLabel?: string;
  className?: string;
  game: SantaView["game"];
  label?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

// «Позвать друзей» (Y06): пока вступивших меньше трёх — системное
// «Поделиться» с текстом приглашения, без него (http в локальной сети,
// десктоп) — текст со ссылкой в буфер. Короткую ссылку берём заранее:
// Safari пускает в «Поделиться» и буфер только сразу после нажатия.
export const InviteFriendsButton = ({
  game,
  label = "Позвать друзей",
  size = "lg",
  variant = "primary",
  className,
  ariaLabel,
}: Props) => {
  usePrefetchInvite("santa", game.id);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const invite = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const payload = {
        title: game.title,
        text: santaInviteText(game, clock.now()),
        url: await inviteUrl("santa", game.id),
      };
      if (canNativeShare()) {
        await shareNative(payload);
        return;
      }
      const ok = await copyText(`${payload.text} ${payload.url}`);
      toast(ok ? "Текст со ссылкой скопирован" : "Не получилось скопировать", {
        tone: ok ? "success" : "error",
      });
    } catch {
      toast("Не получилось собрать ссылку", {
        tone: "error",
        action: { label: "Повторить", onClick: () => void invite() },
      });
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      aria-label={ariaLabel}
      aria-busy={busy || undefined}
      icon={
        <UserPlus aria-hidden size={size === "sm" ? 16 : 20} strokeWidth={2} />
      }
      onClick={() => void invite()}
    >
      {label}
    </Button>
  );
};
