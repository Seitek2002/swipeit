import type { CSSProperties, ReactNode } from "react";

// Бирки висят на нитках и чуть покачиваются — единственное фоновое движение
// в приложении (reference.html, онбординг). Предметы нарисованы контуром,
// цвета — только токены DESIGN.md (через CSS-переменные).

const mix = (token: string, percent: number) =>
  `color-mix(in srgb, var(--color-${token}) ${percent}%, var(--color-paper))`;
const tint = (token: string, percent: number) =>
  `linear-gradient(165deg, ${mix(token, percent)} 0%, var(--color-paper-2) 100%)`;

const Illus = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 160 160"
    aria-hidden
    className="stroke-ink size-[84%] overflow-visible fill-none"
    strokeWidth={2.4}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const floor = (cx: number, cy: number, rx: number) => (
  <ellipse
    cx={cx}
    cy={cy}
    rx={rx}
    ry={5}
    style={{ fill: "rgb(42 16 36 / .09)", stroke: "none" }}
  />
);

const CANDLE = (
  <Illus>
    {floor(80, 138, 40)}
    <circle
      cx="80"
      cy="36"
      r="24"
      style={{ fill: "rgb(255 138 61 / .14)", stroke: "none" }}
    />
    <path
      d="M50 70h60v52a12 12 0 0 1-12 12H62a12 12 0 0 1-12-12z"
      style={{ fill: mix("champagne", 78) }}
    />
    <rect
      x="47"
      y="62"
      width="66"
      height="11"
      rx="4"
      style={{ fill: "var(--color-paper-2)" }}
    />
    <rect
      x="61"
      y="88"
      width="38"
      height="28"
      rx="4"
      style={{ fill: "var(--color-paper)" }}
    />
    <path
      d="M69 98h22M73 106h14"
      style={{ stroke: "var(--color-ink-soft)", strokeWidth: 1.8 }}
    />
    <path d="M80 62v-9" />
    <path
      d="M80 52c-8-7-6-17 0-26 6 9 8 19 0 26z"
      style={{ fill: "var(--color-mandarin)", strokeWidth: 1.8 }}
    />
  </Illus>
);

const HEADPHONES = (
  <Illus>
    {floor(80, 140, 46)}
    <path d="M38 98V82a42 42 0 0 1 84 0v16" style={{ strokeWidth: 11 }} />
    <path
      d="M38 98V82a42 42 0 0 1 84 0v16"
      style={{ stroke: "var(--color-paper)", strokeWidth: 6.5 }}
    />
    <rect
      x="24"
      y="88"
      width="28"
      height="44"
      rx="13"
      style={{ fill: "var(--color-paper)" }}
    />
    <rect
      x="108"
      y="88"
      width="28"
      height="44"
      rx="13"
      style={{ fill: "var(--color-paper)" }}
    />
    <rect
      x="47"
      y="96"
      width="9"
      height="28"
      rx="4.5"
      style={{ fill: "var(--color-paper-2)" }}
    />
    <rect
      x="104"
      y="96"
      width="9"
      height="28"
      rx="4.5"
      style={{ fill: "var(--color-paper-2)" }}
    />
    <circle
      cx="124"
      cy="104"
      r="2.6"
      style={{ fill: "var(--color-mandarin)", stroke: "none" }}
    />
  </Illus>
);

const CAMERA = (
  <Illus>
    {floor(80, 144, 46)}
    <rect
      x="58"
      y="114"
      width="44"
      height="26"
      rx="2"
      style={{ fill: "var(--color-paper)" }}
    />
    <rect
      x="32"
      y="46"
      width="96"
      height="74"
      rx="17"
      style={{ fill: mix("mint", 72) }}
    />
    <rect
      x="42"
      y="56"
      width="20"
      height="12"
      rx="3"
      style={{ fill: "var(--color-paper)" }}
    />
    <circle cx="80" cy="86" r="24" style={{ fill: "var(--color-paper)" }} />
    <circle cx="80" cy="86" r="13" style={{ fill: "var(--color-ink-soft)" }} />
    <circle
      cx="75"
      cy="81"
      r="3.5"
      style={{ fill: "var(--color-paper)", stroke: "none" }}
    />
    <circle
      cx="116"
      cy="106"
      r="3"
      style={{ fill: "var(--color-mandarin)", stroke: "none" }}
    />
  </Illus>
);

type Tag = {
  delay: number;
  duration: number;
  illus: ReactNode;
  length: number;
  rotate: number;
  tint: string;
  x: string;
};

const TAGS: Tag[] = [
  {
    illus: CANDLE,
    tint: tint("rose", 62),
    x: "7%",
    length: 150,
    rotate: -8,
    duration: 6.4,
    delay: -1.2,
  },
  {
    illus: HEADPHONES,
    tint: tint("champagne", 62),
    x: "calc(50% - 60px)",
    length: 205,
    rotate: 2,
    duration: 7.2,
    delay: -3.4,
  },
  {
    illus: CAMERA,
    tint: tint("mint", 55),
    x: "calc(93% - 120px)",
    length: 128,
    rotate: 9,
    duration: 5.8,
    delay: -0.4,
  },
];

export const HangingTags = () => (
  <div aria-hidden className="relative h-full overflow-hidden">
    {TAGS.map((tag) => (
      <div
        key={tag.x}
        className="hang absolute -top-5 w-[120px] origin-top drop-shadow-[0_16px_18px_rgb(10_0_8/0.42)]"
        style={
          {
            left: tag.x,
            "--rot": `${tag.rotate}deg`,
            "--dur": `${tag.duration}s`,
            "--delay": `${tag.delay}s`,
          } as CSSProperties
        }
      >
        <span
          className="bg-rose mx-auto block w-[1.6px]"
          style={{ height: tag.length }}
        />
        <div className="paper rounded-[18px] -mt-3.5 flex h-[150px] p-2 pt-7 [mask:radial-gradient(circle_6px_at_50%_14px,#0000_96%,#000_100%)] before:border-paper-2 before:absolute before:top-3.5 before:left-1/2 before:-mt-2.5 before:-ml-2.5 before:size-5 before:rounded-full before:border-[2.5px] before:content-['']">
          <div
            className="grid flex-1 place-items-center overflow-hidden rounded-xl"
            style={{ background: tag.tint }}
          >
            {tag.illus}
          </div>
        </div>
      </div>
    ))}
  </div>
);
