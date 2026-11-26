// Русские числительные: 1 подарок, 2 подарка, 5 подарков (TECH_SPEC §12).
// 11–14 — исключение: у них «многие», хотя последняя цифра 1–4.
export const plural = (
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string => {
  const tail = Math.abs(Math.trunc(count)) % 100;
  const last = tail % 10;
  if (tail > 10 && tail < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last > 1 && last < 5) return forms[1];
  return forms[2];
};

// «3 подарка» — число и слово вместе.
export const pluralize = (
  count: number,
  forms: readonly [one: string, few: string, many: string],
): string => `${count} ${plural(count, forms)}`;
