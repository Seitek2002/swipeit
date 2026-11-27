import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // Список фич задан в TECH_SPEC §4: каждая — отдельное действие
    // пользователя (сброс демо, своё желание, правка вишлиста, фильтры…), и
    // большинство по замыслу живёт на одном экране. Слить их со страницами,
    // как предлагает правило, значит разойтись с контрактом архитектуры.
    //
    // Особенность steiger: файлы, для которых правило выключено, он не
    // считает и источниками ссылок. Поэтому слайсы, на которые ссылаются
    // только фичи, тоже могут попасть в «одна ссылка».
    files: ["./src/features/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
  {
    // Временно, до T14: билетик занятия пока только в создании плана.
    // Вторым потребителем станет колода билетиков (widgets/activity-deck).
    files: ["./src/entities/activity/**"],
    rules: {
      "fsd/insignificant-slice": "off",
    },
  },
]);
