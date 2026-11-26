import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Временно, до T12: сброс демо сейчас вызывается только из профиля.
    // Вторым потребителем станет демо-панель («Сбросить всё») — тогда убрать.
    files: ["./src/features/demo-reset/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
  {
    // Временно, до T10: колода подарков, фильтры и «Подробнее» пока живут
    // только на экране «Подарки». Вторым потребителем станет «Выбери подарок
    // сам» (/pick/: та же колода с заблокированными фильтрами) — тогда убрать.
    //
    // Особенность steiger: файлы, для которых правило выключено, он не
    // считает и источниками ссылок. Поэтому в список попали и entities/product
    // с features/swipe-deck — их второй потребитель как раз gift-deck.
    files: [
      "./src/entities/product/**",
      "./src/features/swipe-deck/**",
      "./src/widgets/gift-deck/**",
      "./src/features/product-filters/**",
      "./src/features/product-details/**",
    ],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
