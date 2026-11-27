// Порог отправки (TECH_SPEC §6 «Порог отправки», решение владельца от
// 27.11.2026): вишлист можно отправить, когда в «Хочу» впервые набралось
// 5 желаний — «Хочу» и «Очень хочу» из своей ленты и свои желания поровну.
// Правило без базы: мок и сервер считают желания каждый по-своему.
export const SHARE_UNLOCK_WISHES = 5;

// Желания в «Хочу» (status "active"): по ним лента над колодой и «Ещё N
// желаний — и можно отправить». До открытия «Мимо», удаление и «Подарили»
// честно уменьшают счёт.
export const countActiveWishItems = (
  items: ReadonlyArray<{ status: string }>,
): number => items.filter((item) => item.status === "active").length;

// Открыть отправку этим действием? Однажды открывшись, она больше не
// закрывается: уже открытая — false.
export const shouldUnlockShare = (
  activeWishes: number,
  unlockedAt: string | undefined,
): boolean => !unlockedAt && activeWishes >= SHARE_UNLOCK_WISHES;
