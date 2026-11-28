import Link from "next/link";

import { REMOTE_COPY, ROUTES } from "@/shared/config";

import { buttonClassName } from "../button";
import { EmptyState } from "../empty-state";

// Битая или чужая ссылка — понятный экран, а не падение (TECH_SPEC §8):
// вишлист, ссылка-фильтр, ответ на неё. closed — короткая ссылка сервера
// закрыта или её нет (remote, R07): человек ничего не испортил, ссылка просто
// больше не работает, и следующий шаг — свой вишлист.
export const BrokenLink = ({ closed = false }: { closed?: boolean }) => (
  <EmptyState
    className="h-full"
    title={
      closed
        ? REMOTE_COPY.linkClosed
        : "Ссылка повреждена. Попроси друга отправить её заново."
    }
    action={
      <Link
        href={closed ? ROUTES.GIFTS : ROUTES.HOME}
        className={buttonClassName({ variant: "secondary" })}
      >
        {closed ? REMOTE_COPY.buildOwnWishlist : "Открыть SwipeIt"}
      </Link>
    }
  />
);
