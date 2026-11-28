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
    className="guide-press block size-14 flex-none [@container(max-height:540px)]:size-10"
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
        // Раскладка — потоком, а не процентами: на низкой карточке (360×640
        // с плашкой Санты и пилюлей фильтра) надписи сжимаются, но не
        // наезжают друг на друга (UX-аудит Y03). Высоту карточки знает
        // контейнер GiftPhoto: ниже 540 px — компактный вариант, линия
        // фото/текста выше, иконки меньше.
        <div className="guide-in absolute inset-0 bg-[rgb(42_16_36/0.55)]">
          <div
            className="absolute top-0 left-1/2 -ml-px h-[52%] border-l-2 border-dashed [@container(max-height:540px)]:h-[44%]"
            style={{ borderColor: DASH }}
          />
          <div
            className="absolute inset-x-0 top-[52%] border-t-2 border-dashed [@container(max-height:540px)]:top-[44%]"
            style={{ borderColor: DASH }}
          />
          <div className="absolute inset-x-0 top-0 flex h-[52%] flex-col [@container(max-height:540px)]:h-[44%]">
            <div className="z-[1] flex-none px-3 pt-7 [@container(max-height:540px)]:pt-4">
              {plaque}
            </div>
            <div className="flex min-h-0 flex-1 items-center">
              <div className="flex w-1/2 flex-col items-center gap-3 px-3 text-center text-[15px] leading-5 font-semibold [@container(max-height:540px)]:gap-1.5">
                <Hand delay="200ms" />
                Предыдущее фото
              </div>
              <div className="flex w-1/2 flex-col items-center gap-3 px-3 text-center text-[15px] leading-5 font-semibold [@container(max-height:540px)]:gap-1.5">
                <Hand delay="500ms" />
                Следующее фото
              </div>
            </div>
          </div>
          <button
            type="button"
            tabIndex={-1}
            onClick={onMore}
            // Вся нижняя часть — «Подробнее о подарке»; подсказка про свайп
            // внизу той же колонки, над рядом кнопок (он — 72 px снизу).
            className="text-paper pointer-events-auto absolute inset-x-0 top-[52%] bottom-0 flex flex-col items-center gap-2 pt-7 pb-[80px] [@container(max-height:540px)]:top-[44%] [@container(max-height:540px)]:gap-1 [@container(max-height:540px)]:pt-2"
          >
            <GuideScroll className="block h-[54px] w-20 flex-none [@container(max-height:540px)]:h-8 [@container(max-height:540px)]:w-12 [@container(max-height:340px)]:hidden" />
            <span className="text-body-lg flex-none font-semibold">
              Подробнее о подарке
            </span>
            <span className="text-caption mt-auto flex-none px-4 pt-2 text-center font-semibold">
              Свайпни вправо — хочу, влево — мимо
              <br />
              Звезда — очень хочу
            </span>
          </button>
        </div>
      )}
    </motion.div>
  );
};
