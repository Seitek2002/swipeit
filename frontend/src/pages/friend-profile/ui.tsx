import { AppHeader } from "@/widgets/app-header";

import { ROUTES } from "@/shared/config";
import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const FriendProfilePage = () => (
  <Screen>
    <AppHeader title="Профиль друга" showBack backHref={ROUTES.FRIENDS} />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будет вишлист друга с бронированием.
      </p>
    </ScreenBody>
  </Screen>
);
