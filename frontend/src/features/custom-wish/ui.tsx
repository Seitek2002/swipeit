"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createCustomWish, isApiError, wishlistKeys } from "@/shared/api";
import {
  BottomSheet,
  Button,
  ImagePickField,
  TextField,
  toast,
} from "@/shared/ui";

type Props = {
  onClose: () => void;
  open: boolean;
};

type Errors = { price?: string; title?: string; url?: string };

const parsePrice = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};

const URL_MAX = 500;

const isUrl = (value: string) => /^https?:\/\/\S+\.\S+/i.test(value.trim());

// «Своё желание» (TASKS T08): название, цена от–до, ссылка и фото — по
// желанию. Фото сжимается и ложится в IndexedDB, в базу — только ключ.
export const CustomWishSheet = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [url, setUrl] = useState("");
  const [imageKey, setImageKey] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const reset = () => {
    setTitle("");
    setPriceMin("");
    setPriceMax("");
    setUrl("");
    setImageKey(undefined);
    setErrors({});
  };

  const create = useMutation({
    mutationFn: createCustomWish,
    onSuccess: (created) => {
      void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
      // Пятым стало своё желание (DESIGN.md §8.3): без банта — кнопка
      // отправки и так под пальцем.
      toast(
        created.shareJustUnlocked
          ? "Вишлист готов — можно отправить друзьям"
          : "Желание добавлено",
      );
      reset();
      onClose();
    },
    onError: (error) =>
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось добавить. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  const handleSubmit = () => {
    const min = parsePrice(priceMin);
    const max = parsePrice(priceMax);
    const nextErrors: Errors = {};
    if (!title.trim()) nextErrors.title = "Напиши, что хочешь";
    if (min !== undefined && max !== undefined && min > max) {
      nextErrors.price = "Цена «от» больше цены «до»";
    }
    if (url.trim() && !isUrl(url))
      nextErrors.url = "Проверь ссылку: она начинается с https://";
    // Длиннее не влезет в ссылку на вишлист — лучше сказать сразу.
    else if (url.trim().length > URL_MAX)
      nextErrors.url =
        "Ссылка слишком длинная. Скопируй её без хвоста после «?»";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    create.mutate({
      title: title.trim(),
      priceMin: min,
      priceMax: max ?? min,
      url: url.trim() || undefined,
      imageKey,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Своё желание"
      height="full"
      footer={
        <Button
          size="lg"
          onClick={handleSubmit}
          loading={create.isPending}
          disabled={!title.trim() || isProcessing}
        >
          Добавить в вишлист
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <TextField
          label="Что хочешь"
          placeholder="Например, абонемент в бассейн"
          maxLength={80}
          value={title}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div>
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="Цена от, сом"
              inputMode="numeric"
              placeholder="1 000"
              value={priceMin}
              onChange={(event) => setPriceMin(event.target.value)}
            />
            <TextField
              label="до, сом"
              inputMode="numeric"
              placeholder="3 000"
              value={priceMax}
              onChange={(event) => setPriceMax(event.target.value)}
            />
          </div>
          {errors.price && (
            <p className="text-caption text-pomegranate mt-2">{errors.price}</p>
          )}
        </div>
        <TextField
          label="Ссылка, если есть"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          error={errors.url}
          onChange={(event) => setUrl(event.target.value)}
        />
        <ImagePickField
          alt="Фото желания"
          value={imageKey}
          onChange={setImageKey}
          onBusyChange={setIsProcessing}
        />
      </div>
    </BottomSheet>
  );
};
