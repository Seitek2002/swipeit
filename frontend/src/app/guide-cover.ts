import { preload } from "react-dom";

import { readFileSync } from "node:fs";
import path from "node:path";

import { GUIDE_PRODUCT_ID } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";

// Обложка обучающей карточки — прямо из HTML `/` и `/gifts/` (TECH_SPEC §6
// «Предзагрузка фото колоды»): браузер начинает её качать сразу после HTML,
// до JS, и карточка появляется уже с фото. Только на сервере, при сборке:
// адрес берётся из каталога (public/catalog после catalog:sync), а не
// вписывается руками. Ссылка ставится всегда — у вернувшихся файл в кеше.
const guideCoverSrc = (): null | string => {
  try {
    const products = JSON.parse(
      readFileSync(
        path.join(process.cwd(), "public", "catalog", "products.json"),
        "utf8",
      ),
    ) as Array<{ id: string; images?: Array<{ src: string }> }>;
    return (
      products.find((product) => product.id === GUIDE_PRODUCT_ID)?.images?.[0]
        ?.src ?? null
    );
  } catch {
    // Каталога нет (сборка без catalog:sync) — без подсказки, лента та же.
    return null;
  }
};

export const preloadGuideCover = () => {
  const src = guideCoverSrc();
  if (src) preload(withBasePath(src), { as: "image", fetchPriority: "high" });
};
