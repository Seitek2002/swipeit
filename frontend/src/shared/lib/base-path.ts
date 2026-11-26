// basePath задаётся при сборке (NEXT_PUBLIC_BASE_PATH): на GitHub Pages сайт
// живёт в /swipeit (TECH_SPEC §13). <Link> и router.push добавляют его сами,
// а fetch, <img src>, манифест, sw.js и ссылки для шеринга — нет. Путь к своему
// файлу без этого хелпера на Pages ведёт на seitek2002.github.io/catalog/… → 404.
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const withBasePath = (path: string): string => {
  // Внешние адреса, data:, blob: и относительные пути — как есть.
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  if (BASE_PATH && (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`))) {
    return path;
  }
  return `${BASE_PATH}${path}`;
};
