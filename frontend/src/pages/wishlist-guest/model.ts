// Следующий шаг гостя после брони и внизу страницы (auto-tasks P01, виральная
// петля PRD §5: тот, кому дарят, приводит тех, кто дарит).
//   collect — профиля нет или в «Хочу» меньше 5: «Собрать свой вишлист»;
//   send — отправка уже открыта: «Отправь свой вишлист в ответ».
export type GuestNextStep = "collect" | "send";

export const guestNextStep = ({
  hasProfile,
  shareUnlocked,
}: {
  hasProfile: boolean;
  shareUnlocked: boolean;
}): GuestNextStep => (hasProfile && shareUnlocked ? "send" : "collect");
