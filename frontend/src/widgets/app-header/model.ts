// Куда ведёт «Назад» в шапке (auto-tasks-ux-6 Z06). Чистая функция — чтобы
// проверить тестом без браузера.
export type BackTarget =
  | { href: string; kind: "push" }
  | { href: string; kind: "replace" }
  | { kind: "custom" }
  | { kind: "history" };

export const resolveBack = ({
  backHref,
  fallbackHref,
  hasOnBack,
  historyLength,
}: {
  backHref?: string;
  fallbackHref?: string;
  hasOnBack: boolean;
  historyLength: number;
}): BackTarget => {
  if (hasOnBack) return { kind: "custom" };
  if (backHref) return { kind: "push", href: backHref };
  // Экран открыт по прямой ссылке в новой вкладке: шага назад нет, и
  // router.back() молчит. Подменяем экран запасным адресом, чтобы «Назад»
  // с того экрана тоже не вёл обратно сюда.
  if (historyLength <= 1) return { kind: "replace", href: fallbackHref ?? "/" };
  return { kind: "history" };
};
