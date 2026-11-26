import { cn } from "@/shared/lib/utils";

import { Bow } from "../bow";

type Props = {
  className?: string;
  size?: "lg" | "md" | "sm";
};

const sizes: Record<
  NonNullable<Props["size"]>,
  { bow: string; word: string }
> = {
  sm: { bow: "h-[21px] w-[30px]", word: "text-[24px]" },
  md: { bow: "h-8 w-[46px]", word: "text-[34px]" },
  lg: { bow: "h-[60px] w-[88px]", word: "text-[64px]" },
};

// Логотип: бант + слово «swipeit» курсивом Cormorant (reference.html, .brand).
export const Brand = ({ size = "md", className }: Props) => (
  <span className={cn("inline-flex items-center gap-2.5", className)}>
    <Bow className={sizes[size].bow} />
    <span
      className={cn(
        "font-display leading-none font-semibold tracking-[-0.01em] italic",
        sizes[size].word,
      )}
    >
      swipeit
    </span>
  </span>
);
