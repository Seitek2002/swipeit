import {
  Bath,
  Coffee,
  Landmark,
  type LucideIcon,
  Mountain,
  PartyPopper,
  Trees,
  UtensilsCrossed,
} from "lucide-react";

import type { Activity } from "@/shared/api";
import type { ActivityCategoryId } from "@/shared/config";
import { formatPrice } from "@/shared/lib/format";

export type { Activity };

// Иконка категории — для своего занятия без фото (DESIGN.md §7 ActivityTicket).
export const CATEGORY_ICONS: Record<ActivityCategoryId, LucideIcon> = {
  active: Mountain,
  chill: Coffee,
  food: UtensilsCrossed,
  culture: Landmark,
  nature: Trees,
  party: PartyPopper,
  selfcare: Bath,
};

const hours = (minutes: number) => {
  const value = minutes / 60;
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(1).replace(".", ",");
};

// «4–8 ч», «90 мин», «2 ч». 0 — длительность не указана (своё занятие).
export const formatDuration = (min: number, max: number): string => {
  if (max <= 0) return "";
  if (max < 60)
    return min === max || min <= 0 ? `${max} мин` : `${min}–${max} мин`;
  if (min === max || min <= 0) return `${hours(max)} ч`;
  return `${hours(min)}–${hours(max)} ч`;
};

// Цена на человека: «Бесплатно», «от 500 сом», «1 500 – 4 500 сом».
export const formatPerPerson = (activity: Activity): string => {
  const { pricePerPersonMin: min, pricePerPersonMax: max } = activity;
  if (max <= 0) return "Бесплатно";
  return formatPrice(min, max);
};
