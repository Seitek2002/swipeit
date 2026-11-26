"use client";

import { type ChangeEvent, useId, useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, X } from "lucide-react";

import { createCustomWish, isApiError, wishlistKeys } from "@/shared/api";
import {
  compressImage,
  saveCustomImage,
  useCustomImageUrl,
} from "@/shared/lib/dom";
import { BottomSheet, Button, Spinner, TextField, toast } from "@/shared/ui";

type Props = {
  onClose: () => void;
  open: boolean;
};

type Errors = { price?: string; title?: string; url?: string };

const parsePrice = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};

const isUrl = (value: string) => /^https?:\/\/\S+\.\S+/i.test(value.trim());

// «Своё желание» (TASKS T08): название, цена от–до, ссылка и фото — по
// желанию. Фото сжимается и ложится в IndexedDB, в базу — только ключ.
export const CustomWishSheet = ({ open, onClose }: Props) => {
  const queryClient = useQueryClient();
  const fileId = useId();
  const [title, setTitle] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [url, setUrl] = useState("");
  const [imageKey, setImageKey] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const preview = useCustomImageUrl(imageKey);

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
      toast("Желание добавлено");
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

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setIsProcessing(true);
    try {
      setImageKey(await saveCustomImage(await compressImage(file)));
    } catch {
      toast("Не получилось сохранить фото. Попробуй другое", { tone: "error" });
    } finally {
      setIsProcessing(false);
    }
  };

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
        <div>
          <p className="text-caption text-rose mb-2">Фото, если хочешь</p>
          {preview ? (
            <div className="relative size-28">
              <img
                src={preview}
                alt="Фото желания"
                className="size-full rounded-2xl object-cover"
              />
              <button
                type="button"
                aria-label="Убрать фото"
                onClick={() => setImageKey(undefined)}
                className="bg-velvet text-paper absolute -top-2 -right-2 grid size-8 place-items-center rounded-full before:absolute before:-inset-1.5 before:content-['']"
              >
                <X aria-hidden size={16} strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <label
              htmlFor={fileId}
              className="border-rose/40 text-rose flex h-28 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed"
            >
              {isProcessing ? (
                <Spinner />
              ) : (
                <ImagePlus aria-hidden size={24} strokeWidth={1.75} />
              )}
              <span className="text-label">Выбрать фото</span>
            </label>
          )}
          <input
            id={fileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFile}
          />
        </div>
      </div>
    </BottomSheet>
  );
};
