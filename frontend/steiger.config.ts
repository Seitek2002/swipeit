import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Временно, до T07: сейчас каталогом пользуется только витрина /kit/
    // (проверка слоя данных из T04). В T07 колода подарков и шторка
    // «Подробнее» станут вторыми потребителями — тогда исключение убрать.
    files: ["./src/entities/product/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
