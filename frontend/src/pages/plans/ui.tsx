import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const PlansPage = () => (
  <Screen>
    <AppHeader title="Че делать будем?" />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будут планы с друзьями: свайп занятий и совпадения.
      </p>
    </ScreenBody>
  </Screen>
);
