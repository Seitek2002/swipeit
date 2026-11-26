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
  {
    // Временно, до T12: сброс демо сейчас вызывается только из профиля.
    // Вторым потребителем станет демо-панель («Сбросить всё») — тогда убрать.
    files: ["./src/features/demo-reset/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
