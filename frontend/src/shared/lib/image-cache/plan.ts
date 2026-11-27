// Какие фото колоды грузить заранее и в каком порядке (TECH_SPEC §6
// «Предзагрузка фото колоды»). Чистая функция — её проверяют тесты.

export type PlanCard = { images: ReadonlyArray<{ src: string }> };

// Окно на 3 карточки: у верхней — все фото, у двух следующих — по два
// первых. Порядок — что человек увидит раньше:
//   1. обложка верхней; 2. 2-е фото верхней; 3. обложка следующей;
//   4. остальные фото верхней; 5. 2-е фото следующей;
//   6. обложка и 2-е фото третьей.
// saveData — окно уже: у верхней только следующее фото после текущего, у
// следующей — обложка.
export const preloadPlan = (
  queue: readonly PlanCard[],
  currentPhotoIndex: number,
  saveData: boolean,
): string[] => {
  const [top, second, third] = queue;
  const src = (card: PlanCard | undefined, index: number) =>
    card?.images[index]?.src;
  const order: Array<string | undefined> = saveData
    ? [
        src(top, currentPhotoIndex),
        src(top, currentPhotoIndex + 1),
        src(second, 0),
      ]
    : [
        src(top, 0),
        src(top, 1),
        src(second, 0),
        ...(top?.images.slice(2).map((image) => image.src) ?? []),
        src(second, 1),
        src(third, 0),
        src(third, 1),
      ];
  // Один URL не грузим дважды (резкое фото и размытая копия — один src).
  return [...new Set(order.filter((value): value is string => Boolean(value)))];
};
