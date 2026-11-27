// «Азамат, Нурай и Данияр» — для «листают вместе с тобой» и «ещё листают».
export const joinNames = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;
