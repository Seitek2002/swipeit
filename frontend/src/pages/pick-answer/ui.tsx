import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const PickAnswerPage = () => (
  <Screen>
    <AppHeader title="Выбор друга" showAvatar={false} />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будут подарки, которые выбрал друг.
      </p>
    </ScreenBody>
  </Screen>
);
