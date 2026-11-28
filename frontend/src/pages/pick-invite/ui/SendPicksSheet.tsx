"use client";

import { useRequireName } from "@/features/ask-name";

import { answerPickRequest } from "@/shared/api";
import { absoluteUrl } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import type { SharedPickRequest } from "@/shared/lib/share-codec";
import { BottomSheet, ShareActions } from "@/shared/ui";

type Props = {
  // Подпись NameSheet, если сервер ответит NAME_REQUIRED.
  caption: (name: string) => string;
  count: number;
  // Лимит «Сколько можно выбрать» выбран целиком: дальше не свайпнуть.
  full?: boolean;
  onClose: () => void;
  open: boolean;
  request: SharedPickRequest;
};

// Ссылка-ответ (DESIGN.md §8.6): собирается заново при каждой отправке — в
// ней все «Хочу» на этот момент, можно свайпать дальше и отправить ещё раз.
export const SendPicksSheet = ({
  open,
  onClose,
  request,
  count,
  full = false,
  caption,
}: Props) => {
  // Имя друга едет в ссылке-ответе: NAME_REQUIRED — NameSheet поверх и повтор.
  const requireName = useRequireName(caption, request.toName);

  const getPayload = async () => {
    const { url } = await answerPickRequest(request.id);
    return {
      title: "Мой выбор подарков",
      text: "Вот что мне понравилось из твоей подборки в SwipeIt",
      url: absoluteUrl(url),
    };
  };

  return (
    <>
      <BottomSheet
        open={open}
        onClose={onClose}
        title="Отправить выбор"
        footer={
          <ShareActions
            getPayload={getPayload}
            onError={requireName.handleError}
            qrLabel="QR-код ссылки-ответа"
          />
        }
      >
        {/* Имя — подлежащим, в именительном (P11, G07): без склонения. */}
        <p className="text-body text-rose pb-2">
          {request.from.name} получит ссылку: в ней —{" "}
          {pluralize(count, ["подарок", "подарка", "подарков"])} и выбранные
          варианты.{" "}
          {full
            ? "Чтобы заменить подарок, верни карточку и отправь ссылку ещё раз."
            : "Можно свайпать дальше и отправить ссылку ещё раз."}
        </p>
      </BottomSheet>
      {requireName.sheet}
    </>
  );
};
