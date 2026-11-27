import Link from "next/link";

import { ROUTES } from "@/shared/config";
import { EmptyState, Screen, ScreenBody, buttonClassName } from "@/shared/ui";

// Неверный адрес (auto-tasks U14): вместо английской «404 This page could not
// be found» — бархатный экран по-русски и путь обратно к подаркам.
export default function NotFound() {
  return (
    <Screen>
      <ScreenBody>
        <EmptyState
          className="h-full"
          title="Такой страницы нет. Возможно, ссылка устарела или в ней опечатка."
          action={
            <Link
              href={ROUTES.GIFTS}
              className={buttonClassName({ size: "lg" })}
            >
              Смотреть подарки
            </Link>
          }
        />
      </ScreenBody>
    </Screen>
  );
}
