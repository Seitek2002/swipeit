import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
};

// Бант — знак SwipeIt (DESIGN.md §6 «Бантик вишлиста», reference.html).
// Мандарином: это «одна яркая вещь» там, где бант стоит.
export const Bow = ({ className }: Props) => (
  <svg
    viewBox="0 0 64 44"
    aria-hidden="true"
    className={cn("h-11 w-16 overflow-visible", className)}
  >
    <g
      className="fill-mandarin stroke-mandarin"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M32 20C24 5 5 2 5 14s19 11 27 6z" />
      <path d="M32 20c8-15 27-18 27-6s-19 11-27 6z" />
      <path className="fill-none" strokeWidth={4} d="M30 23c-4 8-8 13-14 19" />
      <path className="fill-none" strokeWidth={4} d="M34 23c4 8 8 13 14 19" />
      <path
        className="fill-none stroke-mandarin-ink"
        strokeWidth={1.6}
        d="M30 19c-6-6-14-8-18-6M34 19c6-6 14-8 18-6"
      />
      <circle cx="32" cy="20" r="5" />
    </g>
  </svg>
);
