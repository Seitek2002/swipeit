"use client";

import { type ReactNode, useRef, useState } from "react";

import type { ProductFilters } from "@/entities/product";
import { useMe } from "@/entities/user";
import {
  OccasionFields,
  occasionDraftOf,
  occasionFromDraft,
} from "@/entities/wishlist";

import { type Occasion, createPickRequest } from "@/shared/api";
import { absoluteUrl } from "@/shared/lib/dom";
import {
  BottomSheet,
  ShareActions,
  Switch,
  TextArea,
  TextField,
} from "@/shared/ui";

type Props = {
  // Условия словами — их показывает экран, который открыл шторку.
  conditions: string;
  // Повод заранее — день рождения друга, если шторку открыли с его профиля
  // или из карточки «Через 5 дней у …» (auto-tasks U01). Читается при
  // монтировании, как «Кому».
  defaultOccasion?: Occasion;
  // «Кому» заполнено заранее — шторку открыли с профиля друга или из
  // баннера его дня рождения (DESIGN.md §8.6 «Где начать»). Читается при
  // монтировании: другому другу — своя шторка (key).
  defaultToName?: string;
  filters: ProductFilters;
  // Сначала имя (DESIGN.md §8.6) — форму NameSheet даёт страница
  // (features/ask-name): фичи друг друга не импортируют. Пока он есть,
  // шторка показывает его; имя сохранилось — сама переходит к ссылке.
  nameStep?: ReactNode;
  onClose: () => void;
  // NAME_REQUIRED от сервера: страница спрашивает имя и повторяет отправку.
  onShareError?: (error: unknown, retry: () => void) => boolean;
  open: boolean;
};

type Input = Parameters<typeof createPickRequest>[0];

// «Отправить этот фильтр другу» (DESIGN.md §8.6): кому, повод, сообщение,
// «Скрыть цены от друга» и кнопки отправки. Ссылка создаётся при первой
// отправке; пока форма не менялась, повторные нажатия шлют ту же ссылку.
export const PickRequestSheet = ({
  open,
  onClose,
  filters,
  conditions,
  defaultToName = "",
  defaultOccasion,
  nameStep,
  onShareError,
}: Props) => {
  const { data: me } = useMe();
  const askName = Boolean(nameStep);
  const [toName, setToName] = useState(defaultToName);
  const [draft, setDraft] = useState(() => occasionDraftOf(defaultOccasion));
  const [message, setMessage] = useState("");
  const [hidePrices, setHidePrices] = useState(false);
  const created = useRef<{ key: string; url: Promise<string> } | null>(null);

  const getPayload = async () => {
    const input: Input = {
      filters,
      hidePrices,
      toName: toName.trim() || undefined,
      occasion: occasionFromDraft(draft) ?? undefined,
      message: message.trim() || undefined,
    };
    const key = JSON.stringify(input);
    if (created.current?.key !== key) {
      const url = createPickRequest(input).then((result) => result.url);
      created.current = { key, url };
      url.catch(() => {
        if (created.current?.key === key) created.current = null;
      });
    }
    const url = await created.current.url;
    const name = me?.name?.trim() || "Друг";
    return {
      title: "Выбери подарок сам",
      text: `${name} хочет подарить тебе подарок. Выбери сам, что тебе нравится`,
      url: absoluteUrl(url),
    };
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={askName ? "Как тебя зовут?" : "Выбери подарок сам"}
      height={askName ? "auto" : "full"}
      footer={
        askName ? undefined : (
          <ShareActions
            getPayload={getPayload}
            onError={onShareError}
            qrLabel="QR-код ссылки-фильтра"
          />
        )
      }
    >
      {askName ? (
        nameStep
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          <div className="paper rounded-paper shadow-paper px-4 py-3.5">
            <p className="text-caption text-ink-soft">Друг выберет подарки</p>
            <p className="text-title-3 mt-0.5 italic">{conditions}</p>
          </div>
          <TextField
            label="Кому"
            placeholder="Имя друга"
            maxLength={40}
            value={toName}
            onChange={(event) => setToName(event.target.value)}
          />
          <OccasionFields value={draft} onChange={setDraft} />
          <TextArea
            label="Сообщение"
            placeholder="Хочу порадовать тебя — выбери, что нравится"
            maxLength={200}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Switch
            label="Скрыть цены от друга"
            description="Друг увидит только подарки в бюджете — без цифр"
            checked={hidePrices}
            onChange={setHidePrices}
          />
        </div>
      )}
    </BottomSheet>
  );
};
