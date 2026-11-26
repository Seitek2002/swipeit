import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { z } from "zod";

import {
  AVATAR_COLORS,
  CATEGORY_IDS,
  type CategoryId,
  MARKETPLACE_IDS,
  type MarketplaceId,
} from "@/shared/config";

// Кодек ссылок (TECH_SPEC §8): данные едут прямо в URL, поэтому ссылка
// работает на другом устройстве без сервера. JSON → короткие ключи →
// lz-string. Конверт { v: 1, k: "wl" | "pk" | "pa", d }. Разбор — только
// через zod: битая или чужая ссылка даёт null, а не исключение.

export type CodecKind = "pa" | "pk" | "wl";

const EnvelopeSchema = z.object({
  v: z.literal(1),
  k: z.enum(["wl", "pk", "pa"]),
  d: z.unknown(),
});

export const encodeEnvelope = (kind: CodecKind, payload: unknown): string =>
  compressToEncodedURIComponent(JSON.stringify({ v: 1, k: kind, d: payload }));

export const decodeEnvelope = <T>(
  encoded: null | string | undefined,
  kind: CodecKind,
  schema: z.ZodType<T>,
): null | T => {
  if (!encoded) return null;
  try {
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) return null;
    const envelope = EnvelopeSchema.safeParse(JSON.parse(json));
    if (!envelope.success || envelope.data.k !== kind) return null;
    const payload = schema.safeParse(envelope.data.d);
    return payload.success ? payload.data : null;
  } catch {
    return null;
  }
};

// ── Вишлист ─────────────────────────────────────────────────────────────
// Короткие ключи экономят длину: вишлист на 30 желаний должен уложиться в
// ~2 000 символов URL (тест обязателен). Фото своих желаний в ссылку не
// кладём — у гостя вместо фото бумажная заглушка.

const OccasionShort = z.object({
  k: z.enum(["birthday", "new_year", "just_because", "custom"]),
  l: z.string().max(60).optional(),
  d: z.string().max(10).optional(),
});

const WishlistShort = z.object({
  o: z.object({
    n: z.string().min(1).max(40),
    c: z.enum(AVATAR_COLORS),
    u: z.string().max(40).optional(),
    b: z.string().max(5).optional(),
  }),
  oc: OccasionShort.optional(),
  m: z.string().max(200).optional(),
  i: z
    .array(
      z.object({
        p: z.string().max(40).optional(),
        c: z
          .object({
            t: z.string().min(1).max(80),
            a: z.number().nonnegative().optional(),
            b: z.number().nonnegative().optional(),
            u: z.string().max(500).optional(),
          })
          .optional(),
        t: z.literal(1).optional(),
        v: z.record(z.string(), z.string()).optional(),
        n: z.string().max(140).optional(),
      }),
    )
    .max(100),
});

export type SharedWishlist = {
  items: Array<{
    custom?: {
      priceMax?: number;
      priceMin?: number;
      title: string;
      url?: string;
    };
    note?: string;
    priority: "normal" | "top";
    productId?: string;
    variantChoice?: Record<string, string>;
  }>;
  message?: string;
  occasion?: {
    date?: string;
    kind: "birthday" | "custom" | "just_because" | "new_year";
    label?: string;
  };
  owner: {
    avatarColor: (typeof AVATAR_COLORS)[number];
    birthday?: string;
    name: string;
    userId?: string;
  };
};

export const encodeWishlist = (wishlist: SharedWishlist): string =>
  encodeEnvelope("wl", {
    o: {
      n: wishlist.owner.name,
      c: wishlist.owner.avatarColor,
      u: wishlist.owner.userId,
      b: wishlist.owner.birthday,
    },
    oc: wishlist.occasion
      ? {
          k: wishlist.occasion.kind,
          l: wishlist.occasion.label,
          d: wishlist.occasion.date,
        }
      : undefined,
    m: wishlist.message || undefined,
    i: wishlist.items.map((item) => ({
      p: item.productId,
      c: item.custom
        ? {
            t: item.custom.title,
            a: item.custom.priceMin,
            b: item.custom.priceMax,
            u: item.custom.url,
          }
        : undefined,
      t: item.priority === "top" ? 1 : undefined,
      v:
        item.variantChoice && Object.keys(item.variantChoice).length
          ? item.variantChoice
          : undefined,
      n: item.note || undefined,
    })),
  });

export const decodeWishlist = (
  encoded: null | string | undefined,
): null | SharedWishlist => {
  const short = decodeEnvelope(encoded, "wl", WishlistShort);
  if (!short) return null;
  // У каждого желания — либо товар, либо своё.
  if (short.i.some((item) => !item.p && !item.c)) return null;
  return {
    owner: {
      name: short.o.n,
      avatarColor: short.o.c,
      userId: short.o.u,
      birthday: short.o.b,
    },
    occasion: short.oc
      ? { kind: short.oc.k, label: short.oc.l, date: short.oc.d }
      : undefined,
    message: short.m,
    items: short.i.map((item) => ({
      productId: item.p,
      custom: item.c
        ? {
            title: item.c.t,
            priceMin: item.c.a,
            priceMax: item.c.b,
            url: item.c.u,
          }
        : undefined,
      priority: item.t ? "top" : "normal",
      variantChoice: item.v,
      note: item.n,
    })),
  };
};

// Ключ желания для броней — стабилен между устройствами (TECH_SPEC §5).
export const sharedItemKey = (item: SharedWishlist["items"][number]) =>
  item.productId ?? `custom:${item.custom?.title ?? ""}`;

// ── «Выбери подарок сам» ────────────────────────────────────────────────

// Пол — для «Азамату», «Айгерим выбрала»; по «Показывать подарки» профиля.
type Gender = "female" | "male";
const GenderShort = z.enum(["f", "m"]);
const toGender = (g?: "f" | "m"): Gender | undefined =>
  g === "f" ? "female" : g === "m" ? "male" : undefined;
const fromGender = (gender?: Gender) =>
  gender === "female" ? "f" : gender === "male" ? "m" : undefined;

const PickRequestShort = z.object({
  i: z.string().min(1).max(40),
  f: z.object({
    n: z.string().min(1).max(40),
    c: z.enum(AVATAR_COLORS),
    u: z.string().max(40).optional(),
    g: GenderShort.optional(),
  }),
  to: z.string().max(40).optional(),
  fl: z.object({
    b: z.tuple([z.number().nonnegative(), z.number().nonnegative().nullable()]),
    // Неизвестная категория — ссылка от более новой версии: считаем битой.
    c: z.array(z.enum(CATEGORY_IDS)).max(CATEGORY_IDS.length),
    m: z.array(z.enum(MARKETPLACE_IDS)).max(MARKETPLACE_IDS.length),
  }),
  h: z.literal(1).optional(),
  oc: OccasionShort.optional(),
  ms: z.string().max(200).optional(),
});

export type SharedPickRequest = {
  filters: {
    budget: { max: null | number; min: number };
    categories: CategoryId[];
    marketplaces: MarketplaceId[];
  };
  from: {
    avatarColor: (typeof AVATAR_COLORS)[number];
    gender?: Gender;
    name: string;
    userId?: string;
  };
  hidePrices: boolean;
  id: string;
  message?: string;
  occasion?: SharedWishlist["occasion"];
  toName?: string;
};

export const encodePickRequest = (request: SharedPickRequest): string =>
  encodeEnvelope("pk", {
    i: request.id,
    f: {
      n: request.from.name,
      c: request.from.avatarColor,
      u: request.from.userId,
      g: fromGender(request.from.gender),
    },
    to: request.toName || undefined,
    fl: {
      b: [request.filters.budget.min, request.filters.budget.max],
      c: request.filters.categories,
      m: request.filters.marketplaces,
    },
    h: request.hidePrices ? 1 : undefined,
    oc: request.occasion
      ? {
          k: request.occasion.kind,
          l: request.occasion.label,
          d: request.occasion.date,
        }
      : undefined,
    ms: request.message || undefined,
  });

export const decodePickRequest = (
  encoded: null | string | undefined,
): null | SharedPickRequest => {
  const short = decodeEnvelope(encoded, "pk", PickRequestShort);
  if (!short) return null;
  return {
    id: short.i,
    from: {
      name: short.f.n,
      avatarColor: short.f.c,
      userId: short.f.u,
      gender: toGender(short.f.g),
    },
    toName: short.to,
    filters: {
      budget: { min: short.fl.b[0], max: short.fl.b[1] },
      categories: short.fl.c,
      marketplaces: short.fl.m,
    },
    hidePrices: short.h === 1,
    occasion: short.oc
      ? { kind: short.oc.k, label: short.oc.l, date: short.oc.d }
      : undefined,
    message: short.ms,
  };
};

const PickAnswerShort = z.object({
  r: z.string().min(1).max(40),
  b: z.object({
    n: z.string().min(1).max(40),
    c: z.enum(AVATAR_COLORS),
    g: GenderShort.optional(),
  }),
  p: z
    .array(
      z.object({
        p: z.string().min(1).max(40),
        t: z.literal(1).optional(),
        v: z.record(z.string(), z.string()).optional(),
      }),
    )
    .max(100),
});

export type SharedPickAnswer = {
  by: {
    avatarColor: (typeof AVATAR_COLORS)[number];
    gender?: Gender;
    name: string;
  };
  picks: Array<{
    priority: "normal" | "top";
    productId: string;
    variantChoice?: Record<string, string>;
  }>;
  requestId: string;
};

export const encodePickAnswer = (answer: SharedPickAnswer): string =>
  encodeEnvelope("pa", {
    r: answer.requestId,
    b: {
      n: answer.by.name,
      c: answer.by.avatarColor,
      g: fromGender(answer.by.gender),
    },
    p: answer.picks.map((pick) => ({
      p: pick.productId,
      t: pick.priority === "top" ? 1 : undefined,
      v:
        pick.variantChoice && Object.keys(pick.variantChoice).length
          ? pick.variantChoice
          : undefined,
    })),
  });

export const decodePickAnswer = (
  encoded: null | string | undefined,
): null | SharedPickAnswer => {
  const short = decodeEnvelope(encoded, "pa", PickAnswerShort);
  if (!short) return null;
  return {
    requestId: short.r,
    by: {
      name: short.b.n,
      avatarColor: short.b.c,
      gender: toGender(short.b.g),
    },
    picks: short.p.map((pick) => ({
      productId: pick.p,
      priority: pick.t ? "top" : "normal",
      variantChoice: pick.v,
    })),
  };
};
