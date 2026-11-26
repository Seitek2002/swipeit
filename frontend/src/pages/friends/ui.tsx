import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const FriendsPage = () => (
  <Screen>
    <AppHeader title="Друзья" showBack />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будут друзья и ближайшие дни рождения.
      </p>
    </ScreenBody>
  </Screen>
);
