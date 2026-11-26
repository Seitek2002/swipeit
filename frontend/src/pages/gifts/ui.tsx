import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const GiftsPage = () => (
  <Screen>
    <AppHeader title="Подарки" />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будет колода подарков: свайпай то, что хочешь сам.
      </p>
    </ScreenBody>
  </Screen>
);
