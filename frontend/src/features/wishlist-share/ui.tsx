"use client";

import { useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { useProduct } from "@/entities/product";
import { useMe } from "@/entities/user";
import type { Occasion, WishlistResponse } from "@/entities/wishlist";

import { shareWishlist, updateWishlistMeta, wishlistKeys } from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { absoluteUrl } from "@/shared/lib/dom";
import { occasionLabel } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  BottomSheet,
  Chip,
  ShareActions,
  TextArea,
  TextField,
} from "@/shared/ui";

type Kind = Occasion["kind"];

const KINDS: Array<{ kind: Kind; label: string }> = [
  { kind: "birthday", label: "День рождения" },
  { kind: "new_year", label: "Новый год" },
  { kind: "just_because", label: "Просто так" },
  { kind: "custom", label: "Свой вариант" },
];

type Props = {
  onClose: () => void;
  open: boolean;
  wishlist?: WishlistResponse;
};

// Фото желания для открытки — только товары каталога: фото своих желаний в
// ссылку не попадают, на открытке их тоже не показываем.
const PreviewPhoto = ({
  productId,
  index,
}: {
  index: number;
  productId: string;
}) => {
  const { data: product } = useProduct(productId);
  const src = product?.images[0]?.src;
  const tilt = [
    "-rotate-[8deg] -translate-x-9",
    "rotate-0 z-[2]",
    "rotate-[8deg] translate-x-9",
  ];
  return (
    <div
      className={cn(
        "paper rounded-field shadow-paper absolute top-0 left-1/2 -ml-9 h-24 w-[72px] overflow-hidden p-1",
        tilt[index],
      )}
    >
      {src && (
        <img
          src={withBasePath(src)}
          alt=""
          className="size-full rounded-[10px] object-cover"
        />
      )}
    </div>
  );
};

// Отправка вишлиста (DESIGN.md §8.4): повод, дата, сообщение, превью-открытка,
// мессенджеры, ссылка и QR. Перед каждой отправкой повод сохраняется, и
// снимок вишлиста собирается заново — в ссылке всегда свежее.
export const WishlistShareSheet = ({ open, onClose, wishlist }: Props) => {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const meta = wishlist?.meta;
  const [kind, setKind] = useState<Kind | null>(meta?.occasion?.kind ?? null);
  const [label, setLabel] = useState(meta?.occasion?.label ?? "");
  const [date, setDate] = useState(meta?.occasion?.date ?? "");
  const [message, setMessage] = useState(meta?.message ?? "");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKind(meta?.occasion?.kind ?? null);
      setLabel(meta?.occasion?.label ?? "");
      setDate(meta?.occasion?.date ?? "");
      setMessage(meta?.message ?? "");
    }
  }

  const occasion: null | Occasion = kind
    ? {
        kind,
        label: kind === "custom" ? label.trim() || undefined : undefined,
        date: date || undefined,
      }
    : null;
  const photos = (wishlist?.items ?? [])
    .filter(
      (item) => item.status === "active" && item.source.kind === "product",
    )
    .slice(0, 3)
    .map((item) =>
      item.source.kind === "product" ? item.source.productId : "",
    );

  const getPayload = async () => {
    await updateWishlistMeta({ occasion, message });
    void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
    const { url } = await shareWishlist();
    const subtitle = occasion ? occasionLabel(occasion) : "";
    return {
      title: "Мой вишлист",
      text: subtitle
        ? `Мой вишлист ${subtitle}. Выбери, что подарить, — я не узнаю, кто что выбрал`
        : "Мой вишлист. Выбери, что подарить, — я не узнаю, кто что выбрал",
      url: absoluteUrl(url),
    };
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Отправить вишлист"
      height="full"
      footer={
        <ShareActions
          getPayload={getPayload}
          qrLabel="QR-код ссылки на вишлист"
        />
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        {/* Превью ссылки — мини-открытка: бирки веером, имя и повод. */}
        <div className="paper rounded-paper shadow-paper flex flex-col items-center gap-3 px-4 pt-5 pb-4">
          <div className="relative h-24 w-full">
            {photos.map((productId, index) => (
              <PreviewPhoto
                key={productId}
                productId={productId}
                index={index}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {me && (
              <Avatar
                name={me.name}
                color={me.avatarColor}
                size={28}
                decorative
              />
            )}
            <p className="text-title-2">Вишлист {me?.name}</p>
          </div>
          {occasion && (
            <p className="text-caption text-ink-soft -mt-2">
              {occasionLabel(occasion)}
            </p>
          )}
        </div>

        <div>
          <p className="text-caption text-rose mb-2">Повод</p>
          <div role="group" aria-label="Повод" className="flex flex-wrap gap-2">
            {KINDS.map((option) => (
              <Chip
                key={option.kind}
                selected={kind === option.kind}
                onClick={() =>
                  setKind(kind === option.kind ? null : option.kind)
                }
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
        {kind === "custom" && (
          <TextField
            label="Какой повод"
            placeholder="Например, на новоселье"
            maxLength={60}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
        )}
        <TextField
          label="Дата, если есть"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
        <TextArea
          label="Сообщение"
          placeholder="Буду рада любому подарку из списка"
          maxLength={200}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
        />
      </div>
    </BottomSheet>
  );
};
