import { AppHeader } from "@/widgets/app-header";

import { ROUTES } from "@/shared/config";
import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const SantaGamePage = () => (
  <Screen>
    <AppHeader title="Игра" showBack backHref={ROUTES.SANTA} />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будут конверт с подопечным и участники игры.
      </p>
    </ScreenBody>
  </Screen>
);
