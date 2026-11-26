// Цены — только через эти функции (DESIGN.md §3, TECH_SPEC §12):
// «2 990 – 3 600 сом»: неразрывные пробелы в тысячах и перед «сом», узкие
// неразрывные пробелы вокруг тире, округление до 10 сом.
export const NBSP = " ";
export const NNBSP = " ";

const roundTo10 = (value: number) => Math.round(value / 10) * 10;

// Разряды руками, а не toLocaleString: в Node и браузерах ICU даёт то
// обычный, то узкий неразрывный пробел — в тестах и на LAN-сервере строки
// разъезжались бы.
export const formatNumber = (value: number): string => {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.abs(Math.round(value)));
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
};

export const formatPrice = (min: number, max?: null | number): string => {
  const low = roundTo10(min);
  if (max === undefined || max === null)
    return `${formatNumber(low)}${NBSP}сом`;
  const high = roundTo10(max);
  if (low === high) return `${formatNumber(low)}${NBSP}сом`;
  return `${formatNumber(low)}${NNBSP}–${NNBSP}${formatNumber(high)}${NBSP}сом`;
};

// Подпись бюджета: «до 5 000 сом», «от 1 000 сом», «1 000 – 5 000 сом».
// max = null — без верхней границы (ProductFilters.budget, TECH_SPEC §5).
export const formatBudget = (min: number, max: null | number): string => {
  if (min <= 0 && max === null) return "Любой бюджет";
  if (min <= 0 && max !== null) return `до${NBSP}${formatPrice(max)}`;
  if (max === null) return `от${NBSP}${formatPrice(min)}`;
  return formatPrice(min, max);
};
