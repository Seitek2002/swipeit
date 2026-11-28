"use client";

import { useState } from "react";

import type { SantaView } from "@/entities/santa-game";

import { ROUTES } from "@/shared/config";
import { absoluteUrl } from "@/shared/lib/dom";
import { BottomSheet, Button, ShareActions } from "@/shared/ui";

type Props = {
  names: readonly string[];
  view: SantaView;
};

// «Напомнить тем, кто без вишлиста» по-настоящему (auto-tasks P08, PRD §7.2):
// раньше кнопка показывала тост «Напомнили…» и никому ничего не отправляла.
// Теперь — шторка с готовым текстом и ссылкой на игру: «Поделиться»,
// «Скопировать», «QR-код».
export const RemindWithoutWishlist = ({ view, names }: Props) => {
  const [open, setOpen] = useState(false);
  const who = names.join(", ");
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Напомнить тем, кто без вишлиста
      </Button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Напомнить про вишлист"
      >
        <p className="text-body text-rose mb-4">
          Отправь в общий чат или лично: {who}.
        </p>
        <ShareActions
          getPayload={async () => ({
            title: view.game.title,
            text: `${who} — соберите вишлист для Тайного Санты «${view.game.title}», так Санте будет проще выбрать подарок`,
            url: absoluteUrl(ROUTES.SANTA_GAME(view.game.id)),
          })}
          qrLabel="QR-код ссылки на игру"
        />
      </BottomSheet>
    </>
  );
};
