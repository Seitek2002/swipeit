"use client";

import type { CSSProperties, ReactNode } from "react";

import { type MotionValue, motion, useTransform } from "motion/react";

import { usePreloaderDone } from "@/shared/lib/preloader";

import { GuideHand, GuideScroll } from "./GuideIcons";

// Текст подсказки для скринридера — у карточки в aria-describedby (сам слой
// aria-hidden).
export const DECK_GUIDE_DESCRIPTION =
  "Свайпни вправо — хочу, влево — мимо. Звезда — очень хочу. Тап по краям фото листает фото, Enter — подробности.";

type Props = {
  onMore: () => void;
  // Плашка «Это демо…» или плашка сети (lan) — вверху под сегментами.
  plaque: ReactNode;
  // Сдвиг карточки: пока её тянут, слой гаснет — видны вуаль и круг.
  x: MotionValue<number>;
};

const DASH = "rgb(255 241 243 / 0.5)";

const Hand = ({ delay }: { delay: string }) => (
  <GuideHand
    className="guide-press block size-14"
    style={{ "--delay": delay } as CSSProperties}
  />
);

// Обучающая карточка (DESIGN.md §7 DeckGuide, эталон — кадр 2
// quick-start.html, образец — гайд tap-tap): слой поверх фото и текстового
// блока, под рядом кнопок. Тапы по половинам фото проходят насквозь
// (pointer-events: none), кнопка «Подробнее о подарке» — единственная живая.
export const DeckGuide = ({ x, onMore, plaque }: Props) => {
  const opacity = useTransform(x, (value) =>
    Math.max(0, 1 - Math.abs(value) / 120),
  );
  // Проявляется после ухода прелоадера: под ним анимацию никто не увидит.
  const shown = usePreloaderDone();

  return (
    <motion.div
      aria-hidden
      style={{ opacity }}
      className="text-paper pointer-events-none absolute inset-0 z-[2]"
    >
      {shown && (
        <div className="guide-in absolute inset-0 bg-[rgb(42_16_36/0.55)]">
          <div
            className="absolute top-0 left-1/2 -ml-px h-[52%] border-l-2 border-dashed"
            style={{ borderColor: DASH }}
          />
          <div
            className="absolute inset-x-0 top-[52%] border-t-2 border-dashed"
            style={{ borderColor: DASH }}
          />
          <div className="absolute inset-x-3 top-7 z-[1]">{plaque}</div>
          <div className="absolute top-[24%] left-0 flex w-1/2 flex-col items-center gap-3 px-3 text-center text-[15px] leading-5 font-semibold">
            <Hand delay="200ms" />
            Предыдущее фото
          </div>
          <div className="absolute top-[24%] right-0 flex w-1/2 flex-col items-center gap-3 px-3 text-center text-[15px] leading-5 font-semibold">
            <Hand delay="500ms" />
            Следующее фото
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={onMore}
            // Низкий экран (360×640): меньше отступ и иконка, чтобы
            // «Подробнее о подарке» не слипалось с подсказкой снизу
            // (auto-tasks U17).
            className="text-paper pointer-events-auto absolute inset-x-0 top-[52%] bottom-0 flex flex-col items-center gap-2 pt-7 [@media(max-height:700px)]:gap-1 [@media(max-height:700px)]:pt-3"
          >
            <GuideScroll className="block h-[54px] w-20 [@media(max-height:700px)]:h-10 [@media(max-height:700px)]:w-16" />
            <span className="text-body-lg font-semibold">
              Подробнее о подарке
            </span>
          </button>
          <p className="text-caption absolute inset-x-4 bottom-[84px] text-center font-semibold">
            Свайпни вправо — хочу, влево — мимо
            <br />
            Звезда — очень хочу
          </p>
        </div>
      )}
    </motion.div>
  );
};
