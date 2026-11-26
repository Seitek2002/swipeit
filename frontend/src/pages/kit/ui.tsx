import { AppHeader } from "@/widgets/app-header";

import { Screen, ScreenBody } from "@/shared/ui";

// Витрина UI-кита — наполняется в T03.
export const KitPage = () => (
  <Screen>
    <AppHeader title="Витрина" showAvatar={false} />
    <ScreenBody className="space-y-4 px-5 pt-2">
      <p className="text-display">Решено: кино</p>
      <p className="text-title-1">Мой вишлист</p>
      <p className="text-title-2">Аромасвеча «Инжир и кедр»</p>
      <p className="text-title-3">на день рождения, 14 марта</p>
      <p className="text-body">Ёлка, щётка, Үй, Өрүк, Ңы</p>
      <p className="text-title-2">Ёлка, щётка, Үй, Өрүк, Ңы</p>
    </ScreenBody>
  </Screen>
);
