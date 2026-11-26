import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
  // На бумаге — «Бумага-2» с переливом (DESIGN.md §7), на бархате — бархат-2.
  tone?: "paper" | "velvet";
};

export const Skeleton = ({ tone = "velvet", className }: Props) => (
  <div
    aria-hidden
    className={cn(
      "skeleton rounded-field",
      tone === "paper" ? "bg-paper-2" : "bg-velvet-2",
      className,
    )}
  />
);
