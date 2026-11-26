import type { ProductFilters } from "../catalog/types";
import { getTransport } from "../transport";
import type { Occasion } from "../wishlist/types";
import type { PickAnswer, PickRequest } from "./types";

type Pick = PickAnswer["picks"][number];

export const createPickRequest = (input: {
  filters: ProductFilters;
  hidePrices: boolean;
  message?: string;
  occasion?: Occasion;
  toName?: string;
}): Promise<{ request: PickRequest; url: string }> =>
  getTransport().request("POST", "/pick-requests", input);

const requestPath = (id: string) => `/pick-requests/${encodeURIComponent(id)}`;

export const getMyPicks = (requestId: string): Promise<{ picks: Pick[] }> =>
  getTransport().request("GET", `${requestPath(requestId)}/picks`);

export const answerPickRequest = (
  requestId: string,
): Promise<{ answer: PickAnswer; url: string }> =>
  getTransport().request("POST", `${requestPath(requestId)}/answer`);

export const importPickAnswer = (
  encoded: string,
): Promise<{ answer: PickAnswer; request: null | PickRequest }> =>
  getTransport().request("POST", "/pick-answers", { encoded });
