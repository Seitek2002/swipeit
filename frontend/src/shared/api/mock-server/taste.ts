import { type CategoryId, INTEREST_IDS } from "@/shared/config";

import type { Product } from "../catalog/types";
import type { Taste, User } from "../users/types";
import type { ProductSwipe } from "../wishlist/types";

// Вкус по лайкам (TECH_SPEC §6 «Вкус»). Интересы больше не спрашиваем в
// анкете — выводим из «Хочу» и «Мимо». Чистые функции без браузерных API:
// их зовут обработчики и во вкладке, и на LAN-сервере.

// Вклад одного свайпа в каждый интерес товара и его категорию.
const DELTA = { like: 1, superlike: 2, pass: -0.3 } as const;
// Вес не опускается ниже −3: десяток «Мимо» не хоронит категорию навсегда,
// пара «Хочу» её возвращает.
const MIN_WEIGHT = -3;
// «Похоже, тебе нравится» — интересы с весом от 2 (два «Хочу» или одно
// «Очень хочу»), не больше 4 чипов.
export const INFER_MIN_WEIGHT = 2;
export const INFER_MAX = 4;
// Тост «вкус сложился» — когда впервые вывелись хотя бы 2 интереса.
export const TASTE_FORMED_COUNT = 2;

// Дробные −0.3 копятся с ошибкой (0.1 + 0.2); округляем до сотых, чтобы
// вес в базе был ровным и сравнения не дрожали.
const round = (value: number) => Math.round(value * 100) / 100;

const add = (
  weights: Partial<Record<string, number>>,
  key: string,
  delta: number,
) => {
  weights[key] = round(Math.max(MIN_WEIGHT, (weights[key] ?? 0) + delta));
};

const isLike = (decision: ProductSwipe["decision"]) =>
  decision === "like" || decision === "superlike";

// Вкус — функция от истории свайпов: тот же список даёт тот же вкус. Поэтому
// «Вернуть» просто пересчитывает его и возвращает точно в прежнее состояние.
// Берём только контекст self: выбор по чужой ссылке-фильтру — не свой вкус.
// Свайпы — в порядке записи (по времени); товары, которых нет в каталоге,
// пропускаем. Нет ни одного свайпа в self — null (вкуса ещё нет).
export const computeTaste = (
  swipes: readonly ProductSwipe[],
  products: ReadonlyMap<string, Product> | readonly Product[],
): null | Taste => {
  const byId: ReadonlyMap<string, Product> =
    products instanceof Map
      ? products
      : new Map((products as readonly Product[]).map((p) => [p.id, p]));
  const own = swipes.filter((swipe) => swipe.context.kind === "self");
  if (own.length === 0) return null;

  const taste: Taste = {
    interests: {},
    categories: {},
    audience: { female: 0, male: 0 },
    likes: 0,
    updatedAt: own[own.length - 1]?.at ?? "",
  };
  for (const swipe of own) {
    const product = byId.get(swipe.productId);
    if (!product) continue;
    const delta = DELTA[swipe.decision];
    for (const interest of new Set(product.interests)) {
      add(taste.interests, interest, delta);
    }
    add(
      taste.categories as Record<CategoryId, number>,
      product.category,
      delta,
    );
    if (isLike(swipe.decision)) {
      taste.likes += 1;
      if (product.audience !== "all") taste.audience[product.audience] += 1;
    }
  }
  return taste;
};

const KNOWN_INTERESTS: ReadonlySet<string> = new Set(INTEREST_IDS);
const interestOrder = (id: string) => INTEREST_IDS.indexOf(id as never);

// «Похоже, тебе нравится» (inferredInterests в GET /me): интересы с весом
// от 2, без уже выбранных и «Не моё», по убыванию веса, не больше 4. Только
// из 20 известных: у чипа в профиле должна быть подпись.
export const inferInterests = (
  taste: null | Taste | undefined,
  user: Pick<User, "interests" | "mutedInterests">,
): string[] => {
  if (!taste) return [];
  const skip = new Set([...user.interests, ...(user.mutedInterests ?? [])]);
  return (
    Object.entries(taste.interests)
      .filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === "number" &&
          entry[1] >= INFER_MIN_WEIGHT &&
          KNOWN_INTERESTS.has(entry[0]) &&
          !skip.has(entry[0]),
      )
      // При равном весе — порядок облака интересов: так чипы не прыгают.
      .sort((a, b) => b[1] - a[1] || interestOrder(a[0]) - interestOrder(b[0]))
      .slice(0, INFER_MAX)
      .map(([id]) => id)
  );
};

// «Вкус сложился»: до свайпа выводилось меньше 2 интересов, после — 2 и
// больше, а тост ещё не показывали (TECH_SPEC §6). Отметку taste_toast
// ставит клиент через POST /me/hints, когда показал тост.
export const isTasteJustFormed = (
  before: null | Taste | undefined,
  after: null | Taste | undefined,
  user: Pick<User, "interests" | "mutedInterests" | "seenHints">,
) =>
  !(user.seenHints ?? []).includes("taste_toast") &&
  inferInterests(before, user).length < TASTE_FORMED_COUNT &&
  inferInterests(after, user).length >= TASTE_FORMED_COUNT;

// Вкус профиля. Обычно он уже лежит в профиле (его пересчитывают свайпы),
// но у профиля из базы до этапа 7 свайпы есть, а вкуса ещё нет — тогда
// считаем на лету, без записи: база не меняется от чтения.
export const tasteOf = (
  user: Pick<User, "id" | "taste">,
  swipes: readonly ProductSwipe[],
  products: ReadonlyMap<string, Product> | readonly Product[],
): null | Taste =>
  user.taste ??
  computeTaste(
    swipes.filter((swipe) => swipe.userId === user.id),
    products,
  );
