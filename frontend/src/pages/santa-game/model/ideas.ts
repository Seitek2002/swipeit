import type { Product } from "@/entities/product";

// Идеи для Санты (auto-tasks P05, PRD §6.3 «Санта сразу видит, что
// подарить»): у подопечного в бюджете меньше трёх желаний — показываем
// подарки из каталога в бюджете игры. Вкус подопечного не используем — он
// приватный (BACKEND §4.6); свайпов не пишем.

export const SANTA_IDEAS_COUNT = 6;
export const SANTA_IDEAS_PER_CATEGORY = 2;
// Идеи нужны, пока в бюджете меньше стольких желаний.
export const SANTA_IDEAS_BELOW = 3;

export const needsSantaIdeas = (inBudgetCount: number) =>
  inBudgetCount < SANTA_IDEAS_BELOW;

// Из ленты — до 6 подарков не дороже бюджета (по нижней цене), не больше
// двух из одной категории и без того, что уже в вишлисте подопечного.
export const santaIdeas = (
  products: readonly Product[],
  budget: number,
  wishlistProductIds: ReadonlySet<string>,
): Product[] => {
  const perCategory = new Map<string, number>();
  const ideas: Product[] = [];
  for (const product of products) {
    if (ideas.length >= SANTA_IDEAS_COUNT) break;
    if (product.priceMin > budget) continue;
    if (wishlistProductIds.has(product.id)) continue;
    const used = perCategory.get(product.category) ?? 0;
    if (used >= SANTA_IDEAS_PER_CATEGORY) continue;
    perCategory.set(product.category, used + 1);
    ideas.push(product);
  }
  return ideas;
};
