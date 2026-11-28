"use client";

import { type ChangeEvent, useId, useState } from "react";

import { ImagePlus, X } from "lucide-react";

import {
  compressImage,
  deleteCustomImage,
  saveCustomImage,
  useCustomImageUrl,
} from "@/shared/lib/dom";

import { Spinner } from "../spinner";
import { toast } from "../toast";

type Props = {
  // Подпись для скринридера у превью: «Фото желания», «Фото занятия».
  alt: string;
  // Подпись под заголовком: что будет с фото дальше.
  hint?: string;
  label?: string;
  // Пока фото сжимается и сохраняется — форму отправлять рано.
  onBusyChange?: (busy: boolean) => void;
  onChange: (imageKey: string | undefined) => void;
  value: string | undefined;
};

// Фото «если хочешь» для своего желания и своего занятия: выбор с
// устройства → сжатие до 720px → IndexedDB (local) или ноутбук (lan). В
// форму уходит только ключ. Заменённое или убранное фото удаляется сразу.
export const ImagePickField = ({
  alt,
  label = "Фото, если хочешь",
  hint,
  value,
  onChange,
  onBusyChange,
}: Props) => {
  const fileId = useId();
  const [isProcessing, setIsProcessing] = useState(false);
  const preview = useCustomImageUrl(value);

  const replace = (next?: string) => {
    if (value && value !== next) {
      void deleteCustomImage(value).catch(() => undefined);
    }
    onChange(next);
  };

  const setBusy = (busy: boolean) => {
    setIsProcessing(busy);
    onBusyChange?.(busy);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      replace(await saveCustomImage(await compressImage(file)));
    } catch (error) {
      toast(
        error instanceof Error && error.name === "ApiError"
          ? error.message
          : "Не получилось сохранить фото. Попробуй другое",
        { tone: "error" },
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <p className="text-caption text-rose mb-2">
        {label}
        {hint && (
          <>
            <br />
            {hint}
          </>
        )}
      </p>
      {preview ? (
        <div className="relative size-28">
          <img
            src={preview}
            alt={alt}
            className="size-full rounded-2xl object-cover"
          />
          <button
            type="button"
            aria-label="Убрать фото"
            onClick={() => replace(undefined)}
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
  );
};
