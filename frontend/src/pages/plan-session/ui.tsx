import { AppHeader } from "@/widgets/app-header";

import { ROUTES } from "@/shared/config";
import { Screen, ScreenBody } from "@/shared/ui";

// Заглушка экрана (T02): навигация по всем маршрутам работает целиком,
// содержимое появится в своей задаче.
export const PlanSessionPage = () => (
  <Screen>
    <AppHeader
      title="План"
      showBack
      backHref={ROUTES.PLANS}
      showAvatar={false}
    />
    <ScreenBody className="px-5 pt-2">
      <p className="text-body text-rose">
        Скоро здесь будут лобби, свайп билетиков и результаты.
      </p>
    </ScreenBody>
  </Screen>
);
