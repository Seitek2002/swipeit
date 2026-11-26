import type { CSSProperties } from "react";

import type { AvatarColor } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

// Классы целиком, а не `bg-avatar-${color}`: Tailwind собирает только те
// классы, которые видит в исходниках строкой.
const BACKGROUNDS: Record<AvatarColor, string> = {
  plum: "bg-avatar-plum",
  mandarin: "bg-avatar-mandarin",
  mint: "bg-avatar-mint",
  champagne: "bg-avatar-champagne",
  rose: "bg-avatar-rose",
  pomegranate: "bg-avatar-pomegranate",
  graphite: "bg-avatar-graphite",
  olive: "bg-avatar-olive",
};

export const getInitial = (name: string) =>
  (Array.from(name.trim())[0] ?? "?").toLocaleUpperCase("ru");

type Props = {
  className?: string;
  color: AvatarColor;
  // Аватар рядом с подписью-именем: скрываем от скринридера, имя и так прочтётся.
  decorative?: boolean;
  name: string;
  size?: number;
};

// DESIGN.md §7 Avatar: круг с инициалом на «тканевом» фоне, текст «Чернила».
// Фото-аватаров в демо нет.
export const Avatar = ({
  name,
  color,
  size = 36,
  decorative = false,
  className,
}: Props) => (
  <span
    role={decorative ? undefined : "img"}
    aria-label={decorative ? undefined : name}
    aria-hidden={decorative || undefined}
    style={{ "--size": `${size}px` } as CSSProperties}
    className={cn(
      "text-ink inline-grid size-(--size) flex-none place-items-center rounded-full text-[calc(var(--size)*0.42)] leading-none font-semibold select-none",
      BACKGROUNDS[color],
      className,
    )}
  >
    {getInitial(name)}
  </span>
);

type StackPerson = { color: AvatarColor; id: string; name: string };

type StackProps = {
  className?: string;
  max?: number;
  people: StackPerson[];
  // Кольцо вокруг аватаров — цвет фона под стеком (на бумаге — бумага).
  ring?: "paper" | "velvet-2" | "velvet";
  size?: number;
};

const RINGS: Record<NonNullable<StackProps["ring"]>, string> = {
  velvet: "shadow-[0_0_0_2px_var(--color-velvet)]",
  "velvet-2": "shadow-[0_0_0_2px_var(--color-velvet-2)]",
  paper: "shadow-[0_0_0_2px_var(--color-paper)]",
};

// DESIGN.md §7 AvatarStack: до 4 аватаров с наложением −8px, дальше «+3».
export const AvatarStack = ({
  people,
  max = 4,
  size = 32,
  ring = "velvet",
  className,
}: StackProps) => {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  const names = people.map((person) => person.name).join(", ");

  return (
    <span role="img" aria-label={names} className={cn("flex", className)}>
      {shown.map((person, index) => (
        <Avatar
          key={person.id}
          name={person.name}
          color={person.color}
          size={size}
          decorative
          className={cn(RINGS[ring], index > 0 && "-ml-2")}
        />
      ))}
      {rest > 0 && (
        <span
          aria-hidden
          style={{ "--size": `${size}px` } as CSSProperties}
          className={cn(
            "bg-velvet-3 text-paper -ml-2 inline-grid size-(--size) flex-none place-items-center rounded-full text-[calc(var(--size)*0.36)] font-semibold",
            RINGS[ring],
          )}
        >
          +{rest}
        </span>
      )}
    </span>
  );
};
