import Link from "next/link";

import { ROUTES } from "@/shared/config";

import { buttonClassName } from "../button";
import { EmptyState } from "../empty-state";

// Битая или чужая ссылка — понятный экран, а не падение (TECH_SPEC §8):
// вишлист, ссылка-фильтр, ответ на неё.
export const BrokenLink = () => (
  <EmptyState
    className="h-full"
    title="Ссылка повреждена. Попроси друга отправить её заново."
    action={
      <Link
        href={ROUTES.HOME}
        className={buttonClassName({ variant: "secondary" })}
      >
        Открыть SwipeIt
      </Link>
    }
  />
);
