"use client";

import { useState } from "react";

import { useMutation } from "@tanstack/react-query";

import type { Activity } from "@/entities/activity";

import { createCustomActivity, isApiError } from "@/shared/api";
import {
  BottomSheet,
  Button,
  ImagePickField,
  TextArea,
  TextField,
  toast,
} from "@/shared/ui";

type Props = {
  onClose: () => void;
  onCreated: (activity: Activity) => void;
  open: boolean;
};

type Errors = { price?: string; title?: string };

const parsePrice = (value: string) => {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : undefined;
};

// «+ Своё занятие» (DESIGN.md §8.7, шаг 3): название, описание, цена на
// человека и фото — всё, кроме названия, по желанию. Своё занятие попадает в
// колоду плана в обход фильтров.
export const CustomActivitySheet = ({ open, onClose, onCreated }: Props) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [imageKey, setImageKey] = useState<string>();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriceMin("");
    setPriceMax("");
    setImageKey(undefined);
    setErrors({});
  };

  const create = useMutation({
    mutationFn: createCustomActivity,
    onSuccess: (activity) => {
      onCreated(activity);
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
    const next: Errors = {};
    if (!title.trim()) next.title = "Напиши, что будем делать";
    if (min !== undefined && max !== undefined && min > max) {
      next.price = "Цена «от» больше цены «до»";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    create.mutate({
      title: title.trim(),
      description: description.trim(),
      pricePerPersonMin: min,
      pricePerPersonMax: max ?? min,
      imageKey,
    });
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Своё занятие"
      height="full"
      footer={
        <Button
          size="lg"
          onClick={handleSubmit}
          loading={create.isPending}
          disabled={!title.trim() || isProcessing}
        >
          Добавить в план
        </Button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <TextField
          label="Что будем делать"
          placeholder="Например, шашлыки у Айгерим на даче"
          maxLength={60}
          value={title}
          error={errors.title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <TextArea
          label="Описание, если нужно"
          placeholder="Где, во сколько, что взять с собой"
          maxLength={300}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <div>
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label="На человека от, сом"
              inputMode="numeric"
              placeholder="500"
              value={priceMin}
              onChange={(event) => setPriceMin(event.target.value)}
            />
            <TextField
              label="до, сом"
              inputMode="numeric"
              placeholder="1 500"
              value={priceMax}
              onChange={(event) => setPriceMax(event.target.value)}
            />
          </div>
          {errors.price && (
            <p className="text-caption text-pomegranate mt-2">{errors.price}</p>
          )}
        </div>
        <ImagePickField
          alt="Фото занятия"
          value={imageKey}
          onChange={setImageKey}
          onBusyChange={setIsProcessing}
        />
      </div>
    </BottomSheet>
  );
};
