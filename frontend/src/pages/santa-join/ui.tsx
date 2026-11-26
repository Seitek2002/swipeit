import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const SantaJoinPage = () => (
  <Screen>
    <AppHeader title="Приглашение в игру" showAvatar={false} />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будет вход в игру Тайного Санты по приглашению.
      </p>
    </ScreenBody>
  </Screen>
);
