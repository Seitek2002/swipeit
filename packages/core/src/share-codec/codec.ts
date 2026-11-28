import * as lzModule from "lz-string";
import { z } from "zod";

import {
  AVATAR_COLORS,
  type Audience,
  CATEGORY_IDS,
  type CategoryId,
  IMPORTANT_DATE_PRESETS,
  type ImportantDatePreset,
  MARKETPLACE_IDS,
  type MarketplaceId,
  OCCASION_KINDS,
  type OccasionKind,
} from "../config/index";
import { PICK_LIMIT_MAX } from "../api/pick/limit";

// lz-string — CommonJS без разметки экспортов: Node в ESM (tsx, `npm run dev`
// сервера) видит только default, бандлеры и vitest — и имена. Берём то, что
// есть.
const lz =
  (lzModule as typeof lzModule & { default?: typeof lzModule }).default ??
  lzModule;
const { compressToEncodedURIComponent, decompressFromEncodedURIComponent } = lz;

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

// Повод: k — вид, d — дата, p — готовый повод значимой даты, l — только
// у старого custom. У important своего названия в ссылке нет никогда: оно
// личное, а свободный текст гостю не склонить (DESIGN §8.4).
const OccasionShort = z.object({
  k: z.enum(OCCASION_KINDS),
  l: z.string().max(60).optional(),
  d: z.string().max(10).optional(),
  p: z.enum(IMPORTANT_DATE_PRESETS).optional(),
});

export type SharedOccasion = {
  date?: string;
  kind: OccasionKind;
  // Только у старого custom.
  label?: string;
  // Только у important.
  preset?: ImportantDatePreset;
};

const encodeOccasion = (occasion: SharedOccasion | undefined) =>
  occasion
    ? {
        k: occasion.kind,
        l:
          occasion.kind === "custom"
            ? occasion.label?.slice(0, 60) || undefined
            : undefined,
        d: occasion.date,
        p: occasion.kind === "important" ? occasion.preset : undefined,
      }
    : undefined;

const decodeOccasion = (
  short: undefined | z.infer<typeof OccasionShort>,
): SharedOccasion | undefined =>
  short
    ? {
        kind: short.k,
        label: short.k === "custom" ? short.l : undefined,
        date: short.d,
        preset: short.k === "important" ? short.p : undefined,
      }
    : undefined;

// Ссылка «Где купить» — только http(s): чужая ссылка не должна увести на
// другую схему. Неподходящую молча отбрасываем, а не ломаем всю ссылку.
const isWebUrl = (value: string | undefined): value is string =>
  Boolean(value && value.length <= 500 && /^https?:\/\//i.test(value));

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
        // Ключ своего желания для броней (два «Книга» — разные желания).
        k: z.string().max(60).optional(),
        c: z
          .object({
            t: z.string().min(1).max(80),
            a: z.number().nonnegative().optional(),
            b: z.number().nonnegative().optional(),
            u: z.string().max(2000).optional(),
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
    // Ключ для броней; без него — по товару или названию (sharedItemKey).
    key?: string;
    note?: string;
    priority: "normal" | "top";
    productId?: string;
    variantChoice?: Record<string, string>;
  }>;
  message?: string;
  occasion?: SharedOccasion;
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
    oc: encodeOccasion(wishlist.occasion),
    m: wishlist.message?.slice(0, 200) || undefined,
    i: wishlist.items.map((item) => ({
      p: item.productId,
      k: item.key,
      c: item.custom
        ? {
            t: item.custom.title.slice(0, 80),
            a: item.custom.priceMin,
            b: item.custom.priceMax,
            u: isWebUrl(item.custom.url) ? item.custom.url : undefined,
          }
        : undefined,
      t: item.priority === "top" ? 1 : undefined,
      v:
        item.variantChoice && Object.keys(item.variantChoice).length
          ? item.variantChoice
          : undefined,
      n: item.note?.slice(0, 140) || undefined,
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
    occasion: decodeOccasion(short.oc),
    message: short.m,
    items: short.i.map((item) => ({
      productId: item.p,
      key: item.k,
      custom: item.c
        ? {
            title: item.c.t,
            priceMin: item.c.a,
            priceMax: item.c.b,
            url: isWebUrl(item.c.u) ? item.c.u : undefined,
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
  item.key ?? item.productId ?? `custom:${item.custom?.title ?? ""}`;

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
    // «Другие» магазины по домену (UX-аудит M1). Нет — как раньше.
    s: z.array(z.string().min(1).max(80)).max(20).optional(),
    // «Показывать подарки»: f — для неё, m — для него. Нет — «всем»: так
    // открываются и старые ссылки, где поля ещё не было.
    a: GenderShort.optional(),
  }),
  h: z.literal(1).optional(),
  // «Сколько можно выбрать». Нет — сколько угодно (и старые ссылки).
  x: z.number().int().min(1).max(PICK_LIMIT_MAX).optional(),
  oc: OccasionShort.optional(),
  ms: z.string().max(200).optional(),
});

export type SharedPickRequest = {
  filters: {
    // Нет — «всем».
    audience?: Audience;
    budget: { max: null | number; min: number };
    categories: CategoryId[];
    marketplaces: MarketplaceId[];
    shops?: string[];
  };
  from: {
    avatarColor: (typeof AVATAR_COLORS)[number];
    gender?: Gender;
    name: string;
    userId?: string;
  };
  hidePrices: boolean;
  id: string;
  // Нет — сколько угодно.
  maxPicks?: number;
  message?: string;
  occasion?: SharedOccasion;
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
      s: request.filters.shops?.length ? request.filters.shops : undefined,
      a: fromGender(
        request.filters.audience === "all"
          ? undefined
          : request.filters.audience,
      ),
    },
    h: request.hidePrices ? 1 : undefined,
    x: request.maxPicks,
    oc: encodeOccasion(request.occasion),
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
      shops: short.fl.s,
      audience: toGender(short.fl.a),
    },
    hidePrices: short.h === 1,
    maxPicks: short.x,
    occasion: decodeOccasion(short.oc),
    message: short.ms,
  };
};

const PickAnswerShort = z.object({
  r: z.string().min(1).max(40),
  b: z.object({
    n: z.string().min(1).max(40),
    c: z.enum(AVATAR_COLORS),
    // id профиля друга: два ответа от разных «Айгерим» не сливаются в один.
    u: z.string().max(40).optional(),
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
    userId?: string;
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
      u: answer.by.userId,
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
      userId: short.b.u,
      gender: toGender(short.b.g),
    },
    picks: short.p.map((pick) => ({
      productId: pick.p,
      priority: pick.t ? "top" : "normal",
      variantChoice: pick.v,
    })),
  };
};
