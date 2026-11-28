"use client";

import { type PlanView, formatDeadline } from "@/entities/plan";

import { inviteUrl, usePrefetchInvite } from "@/shared/lib/dom";
import { BottomSheet, Button, DemoLinkNote, ShareActions } from "@/shared/ui";

import { inviteText } from "../model";

type Props = {
  onClose: () => void;
  open: boolean;
  view: PlanView;
};

// «Отправь план в чат» (auto-tasks-ux-5 Y01): в «До даты» нет лобби, и
// уведомлений друзьям тоже нет — без ссылки в первые минуты план мёртв.
// Шторка открывается сразу после «Начать» и по иконке «Позвать» в шапке
// колоды. «Скопировать» кладёт текст вместе со ссылкой — готовое сообщение.
export const InviteSheet = ({ open, onClose, view }: Props) => {
  const { plan, activities } = view;
  usePrefetchInvite("plan", plan.id, open);
  const until = plan.deadline
    ? formatDeadline(plan.deadline).replace(/^До /, "до ")
    : null;
  const text = inviteText(plan.title, until, activities.length);

  return (
    <BottomSheet open={open} onClose={onClose} title="Отправь план в чат">
      <div className="flex flex-col gap-2 pb-2">
        <p className="text-body text-paper">{text}</p>
        <ShareActions
          copyWithText
          qrLabel="QR-код приглашения в план"
          getPayload={async () => ({
            title: plan.title,
            text,
            url: await inviteUrl("plan", plan.id),
          })}
        />
        <DemoLinkNote className="text-center" />
        <Button
          variant="secondary"
          size="lg"
          className="mt-3"
          onClick={onClose}
        >
          Сначала полистаю
        </Button>
      </div>
    </BottomSheet>
  );
};
