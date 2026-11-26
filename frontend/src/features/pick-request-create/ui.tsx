"use client";

import { useRef, useState } from "react";

import type { ProductFilters } from "@/entities/product";
import { useMe } from "@/entities/user";
import {
  OccasionFields,
  occasionDraftOf,
  occasionFromDraft,
} from "@/entities/wishlist";

import { createPickRequest } from "@/shared/api";
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
  filters: ProductFilters;
  onClose: () => void;
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
}: Props) => {
  const { data: me } = useMe();
  const [toName, setToName] = useState("");
  const [draft, setDraft] = useState(() => occasionDraftOf());
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
    const name = me?.name ?? "Друг";
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
      title="Выбери подарок сам"
      height="full"
      footer={
        <ShareActions getPayload={getPayload} qrLabel="QR-код ссылки-фильтра" />
      }
    >
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
    </BottomSheet>
  );
};
