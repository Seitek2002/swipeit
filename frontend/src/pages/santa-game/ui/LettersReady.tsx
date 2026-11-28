"use client";

import { useState } from "react";

import { MessageCircle } from "lucide-react";

import { type SantaView, santaTerms } from "@/entities/santa-game";

import { ROUTES } from "@/shared/config";
import { absoluteUrl } from "@/shared/lib/dom";
import { formatDayMonth } from "@/shared/lib/format";
import { Button, DemoLinkNote, ShareActions } from "@/shared/ui";

import { lettersMessage } from "../model/letters";

// «Сообщить в чат» после жеребьёвки (auto-tasks-pm-2 Q06): уведомлений нет,
// а жеребьёвка по дате проходит, пока телефоны выключены. Организатору блок
// виден всегда, участнику — по кнопке.
export const LettersReady = ({
  view,
  isOwner,
  meId,
}: {
  isOwner: boolean;
  meId: string;
  view: SantaView;
}) => {
  const [expanded, setExpanded] = useState(isOwner);
  const text = lettersMessage({
    title: view.game.title,
    terms: santaTerms(view.game),
    exchange: formatDayMonth(view.game.exchangeDate),
    members: view.members.filter((member) => member.joined),
    senderId: meId,
  });

  if (!expanded) {
    return (
      <Button
        variant="ghost"
        icon={<MessageCircle aria-hidden size={18} strokeWidth={1.75} />}
        onClick={() => setExpanded(true)}
      >
        Сообщить в чат
      </Button>
    );
  }
  return (
    <section className="flex flex-col gap-3">
      <p className="text-label">Сообщить в чат</p>
      <p className="text-caption text-rose">{text}</p>
      <ShareActions
        getPayload={async () => ({
          title: view.game.title,
          text,
          url: absoluteUrl(ROUTES.SANTA_GAME(view.game.id)),
        })}
        qrLabel="QR-код игры"
        secondary
        copyWithText
      />
      <DemoLinkNote />
    </section>
  );
};
