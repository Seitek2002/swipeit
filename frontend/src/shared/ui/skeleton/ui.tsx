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

// Содержимое экрана, пока нет данных: заголовок и бумажный блок — тот же
// вид, что у экранов по ссылке (план, Санта, вишлист друга) при загрузке.
export const ContentSkeleton = ({ className }: { className?: string }) => (
  <div
    role="status"
    aria-label="Загружаем экран"
    className={cn("flex flex-col gap-4 px-5 pt-6", className)}
  >
    <Skeleton className="h-9 w-2/3" />
    <Skeleton tone="paper" className="h-40 rounded-[22px]" />
  </div>
);

// Экран целиком: шапка 56px с местом под заголовок и содержимое. Вместо
// неподвижного логотипа после прелоадера (DESIGN.md §6 «Прелоадер»), пока
// экран ждёт режим, сессию или профиль.
export const ScreenSkeleton = () => (
  <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
    <div aria-hidden className="flex h-14 flex-none items-center px-5">
      <Skeleton className="h-8 w-40" />
    </div>
    <ContentSkeleton />
  </div>
);
