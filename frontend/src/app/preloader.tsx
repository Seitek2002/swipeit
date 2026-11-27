"use client";

import type { CSSProperties } from "react";

import { PRELOADER_ID, usePreloaderDone } from "@/shared/lib/preloader";

// Прелоадер (DESIGN.md §6 «Прелоадер», эталон — кадр 1 quick-start.html):
// статический HTML и встроенный <style> прямо в корневом layout — он рисуется
// с первого кадра, ещё до загрузки JS. Убирает его shared/lib/preloader.
// Анимируются только transform, opacity и clip-path. Цвета — токены из
// globals.css (запасные значения — на случай, если стили ещё не пришли).
const CSS = `
#${PRELOADER_ID} {
  position: fixed; inset: 0; z-index: 1000;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px;
  background:
    radial-gradient(120% 60% at 50% -10%, rgb(255 138 61 / 0.1), transparent 60%),
    var(--color-velvet, #2a1024);
  transition: opacity 300ms ease;
  /* Страховка без JS: если приложение так и не запустилось, не закрываем
     экран навсегда. В обычной загрузке его уберёт скрипт раньше. */
  animation: pre-out 300ms ease 12s forwards;
}
#${PRELOADER_ID}[data-hidden] { opacity: 0; pointer-events: none; }
#${PRELOADER_ID} .pre-badge { position: relative; width: 96px; height: 96px; animation: pre-breathe 1.6s ease-in-out 0.6s infinite; }
#${PRELOADER_ID} .pre-badge > i { position: absolute; inset: 0; border-radius: 24px; }
/* clip-path обрезал бы тень самой плашки — тень и свечение отдельными слоями. */
#${PRELOADER_ID} .pre-shadow { box-shadow: 0 18px 40px -12px rgb(10 0 8 / 0.55), 0 4px 10px rgb(10 0 8 / 0.25); opacity: 0; animation: pre-show 0.5s var(--ease-out-soft, cubic-bezier(0.16, 1, 0.3, 1)) forwards; }
#${PRELOADER_ID} .pre-glow { box-shadow: 0 0 22px rgb(255 138 61 / 0.35); opacity: 0; animation: pre-glow 1.6s ease-in-out 0.6s infinite; }
#${PRELOADER_ID} .pre-plate {
  display: grid; place-items: center; background: var(--color-paper, #fff1f3); box-shadow: 0 1px 0 rgb(255 255 255 / 0.6) inset;
  clip-path: inset(100% 0 0 0); animation: pre-reveal 0.5s var(--ease-out-soft, cubic-bezier(0.16, 1, 0.3, 1)) forwards;
}
#${PRELOADER_ID} .pre-bow { width: 56px; height: 38px; opacity: 0; transform: scale(0.6); animation: pre-bow-in 0.35s var(--ease-out-soft, cubic-bezier(0.16, 1, 0.3, 1)) 0.25s forwards; }
#${PRELOADER_ID} .pre-bow svg { display: block; width: 100%; height: 100%; overflow: visible; animation: pre-bow-sway 1.4s ease-in-out 0.6s infinite; }
#${PRELOADER_ID} .pre-bow g { fill: var(--color-mandarin, #ff8a3d); stroke: var(--color-mandarin, #ff8a3d); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
#${PRELOADER_ID} .pre-bow .tail { fill: none; stroke-width: 4; }
#${PRELOADER_ID} .pre-bow .fold { fill: none; stroke: var(--color-mandarin-ink, #b8460e); stroke-width: 1.6; }
#${PRELOADER_ID} .pre-word { display: flex; margin: 0; font: italic 600 34px/40px var(--font-cormorant), "Times New Roman", serif; color: var(--color-paper, #fff1f3); }
#${PRELOADER_ID} .pre-word span { display: inline-block; opacity: 0; transform: translateY(10px); animation: pre-letter 0.35s var(--ease-out-soft, cubic-bezier(0.16, 1, 0.3, 1)) forwards; animation-delay: calc(0.45s + var(--n) * 0.05s); }
@keyframes pre-reveal { to { clip-path: inset(0); } }
@keyframes pre-show { to { opacity: 1; } }
@keyframes pre-glow { 0%, 100% { opacity: 0; } 50% { opacity: 1; } }
@keyframes pre-breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.06); } }
@keyframes pre-bow-in { to { opacity: 1; transform: scale(1); } }
@keyframes pre-bow-sway { 0%, 100% { transform: rotate(0deg) scale(1); } 50% { transform: rotate(-4deg) scale(1.06); } }
@keyframes pre-letter { to { opacity: 1; transform: translateY(0); } }
@keyframes pre-out { to { opacity: 0; visibility: hidden; } }
@media (prefers-reduced-motion: reduce) {
  #${PRELOADER_ID} .pre-badge, #${PRELOADER_ID} .pre-badge > i, #${PRELOADER_ID} .pre-plate, #${PRELOADER_ID} .pre-bow, #${PRELOADER_ID} .pre-bow svg, #${PRELOADER_ID} .pre-word span { animation: none; }
  #${PRELOADER_ID} .pre-shadow, #${PRELOADER_ID} .pre-bow, #${PRELOADER_ID} .pre-word span { opacity: 1; }
  #${PRELOADER_ID} .pre-plate { clip-path: none; }
  #${PRELOADER_ID} .pre-bow, #${PRELOADER_ID} .pre-word span { transform: none; }
}
`;

const WORD = "swipeit";

// Клиентский компонент только ради одного: после ухода вернуть null, чтобы
// узел убрал React (см. usePreloaderDone). Разметка — та же в статическом HTML.
export const Preloader = () => {
  const done = usePreloaderDone();
  if (done) return null;
  return (
    <div id={PRELOADER_ID} role="status" aria-label="Загружаем SwipeIt">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pre-badge" aria-hidden="true">
        <i className="pre-shadow" />
        <i className="pre-glow" />
        <i className="pre-plate">
          <span className="pre-bow">
            <svg viewBox="0 0 64 44">
              <g>
                <path d="M32 20C24 5 5 2 5 14s19 11 27 6z" />
                <path d="M32 20c8-15 27-18 27-6s-19 11-27 6z" />
                <path className="tail" d="M30 23c-4 8-8 13-14 19" />
                <path className="tail" d="M34 23c4 8 8 13 14 19" />
                <path
                  className="fold"
                  d="M30 19c-6-6-14-8-18-6M34 19c6-6 14-8 18-6"
                />
                <circle cx="32" cy="20" r="5" />
              </g>
            </svg>
          </span>
        </i>
      </div>
      <p className="pre-word" aria-hidden="true">
        {[...WORD].map((letter, index) => (
          <span key={index} style={{ "--n": index } as CSSProperties}>
            {letter}
          </span>
        ))}
      </p>
    </div>
  );
};
