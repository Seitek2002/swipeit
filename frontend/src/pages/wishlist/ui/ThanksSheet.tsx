"use client";

import { useState } from "react";

import { Copy, Share2 } from "lucide-react";

import type { WishlistItem } from "@/entities/wishlist";

import { shareWishlist } from "@/shared/api";
import { absoluteUrl, canNativeShare, copyText } from "@/shared/lib/dom";
import { BottomSheet, Button, toast } from "@/shared/ui";

type Props = {
  item: null | WishlistItem;
  onClose: () => void;
  title: string;
  // Отправка открыта (5 «Хочу») — в конце ссылка на мой вишлист.
  withWishlistLink: boolean;
};

// «Сказать спасибо» после «Мне это подарили» (auto-tasks P14, PRD §5):
// даритель видит, что подарок угадан, а вишлист ещё раз попадает в чат.
// Дарителя указал сам владелец — тайна брони не нарушается. Без открытой
// отправки — только текст.
export const ThanksSheet = ({
  item,
  title,
  withWishlistLink,
  onClose,
}: Props) => {
  const [busy, setBusy] = useState(false);
  const name = item?.given?.fromName ?? "";
  // Без рода: «угадал(а)» — нет, «в точку» — для всех.
  const text = `${name}, спасибо за «${title}» — в точку!`;

  const withLink = async () => {
    if (!withWishlistLink) return text;
    const { url } = await shareWishlist();
    return `${text} Если захочешь ещё порадовать — мой вишлист: ${absoluteUrl(url)}`;
  };

  const run = async (action: (full: string) => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action(await withLink());
    } catch {
      toast("Не получилось. Попробуй ещё раз", { tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={item !== null} onClose={onClose} title="Сказать спасибо">
      <p className="text-body text-paper bg-velvet-3 rounded-field mb-4 px-4 py-3">
        {text}
        {withWishlistLink && " + ссылка на твой вишлист"}
      </p>
      <div className="flex flex-col gap-2">
        {canNativeShare() && (
          <Button
            size="lg"
            loading={busy}
            icon={<Share2 aria-hidden size={18} strokeWidth={1.75} />}
            onClick={() =>
              void run((full) =>
                // Без url: ссылка, если есть, уже в тексте.
                navigator
                  .share({ title: "Спасибо!", text: full })
                  .catch((error: unknown) => {
                    // Человек закрыл системное окно — не ошибка.
                    if ((error as Error)?.name !== "AbortError") throw error;
                  }),
              )
            }
          >
            Поделиться
          </Button>
        )}
        <Button
          size="lg"
          variant="secondary"
          loading={busy}
          icon={<Copy aria-hidden size={18} strokeWidth={1.75} />}
          onClick={() =>
            void run(async (full) => {
              const ok = await copyText(full);
              toast(ok ? "Текст скопирован" : "Не получилось скопировать", {
                tone: ok ? "success" : "error",
              });
            })
          }
        >
          Скопировать
        </Button>
      </div>
    </BottomSheet>
  );
};
