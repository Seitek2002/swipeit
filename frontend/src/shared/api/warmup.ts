import { withBasePath } from "@/shared/lib/base-path";

// Первое открытие (T25, Lighthouse /gifts/): мок-сервер и каталог качаются
// сразу при старте JS, параллельно с проверкой режима (/api/health), а не
// цепочкой «режим → чанк мок-сервера → products.json → первая карточка».
// В режиме lan это лишняя загрузка с ноутбука — по локальной сети это дёшево,
// а на Pages экономит секунды до первой карточки.
let products: null | Promise<unknown> = null;

export const warmLocalApi = () => {
  if (typeof window === "undefined") return;
  void import("./mock-server/adapters/browser").catch(() => undefined);
  products ??= fetch(withBasePath("/catalog/products.json"))
    .then((response) => (response.ok ? response.json() : null))
    // Не вышло — каталог загрузится обычным путём и покажет свою ошибку.
    .catch(() => null);
};

// Каталог, скачанный заранее (или null — тогда грузить самому). Отдаётся
// один раз: повторная загрузка после ошибки идёт заново.
export const takeWarmProducts = (): null | Promise<unknown> => {
  const pending = products;
  products = null;
  return pending;
};
