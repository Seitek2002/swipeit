import { AppHeader } from "@/widgets/app-header";

import { ROUTES } from "@/shared/config";
import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const SantaCreatePage = () => (
  <Screen>
    <AppHeader
      title="Новая игра"
      showBack
      backHref={ROUTES.SANTA}
      showAvatar={false}
    />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будет создание игры Тайного Санты.
      </p>
    </ScreenBody>
  </Screen>
);
