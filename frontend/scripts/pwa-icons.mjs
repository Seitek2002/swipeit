// Генерирует иконки PWA (TECH_SPEC §11): бант на бархате — 192, 512, maskable
// 512 и apple-touch-icon 180. Запускается вручную: `node scripts/pwa-icons.mjs`.
// Результат лежит в репозитории (public/icons, app/apple-icon.png), в сборку
// скрипт не входит. Как og-image.mjs: HTML-страница → снимок headless Chrome.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];
const chrome = CHROME_CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("pwa-icons: не нашёл Chrome. Укажи путь в CHROME_PATH.");
  process.exit(1);
}

// Бант — тот же контур, что в app/icon.svg и в логотипе (DESIGN.md §5).
const BOW = `<g fill="#ff8a3d" stroke="#ff8a3d" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
  <path d="M32 20C24 5 5 2 5 14s19 11 27 6z"/>
  <path d="M32 20c8-15 27-18 27-6s-19 11-27 6z"/>
  <path fill="none" stroke-width="4" d="M30 23c-4 8-8 13-14 19M34 23c4 8 8 13 14 19"/>
  <circle cx="32" cy="20" r="5"/></g>`;

// scale — доля банта от стороны: у maskable бант в безопасной зоне (80%
// круга), фон до краёв — система сама скруглит или обрежет.
const ICONS = [
  { out: "public/icons/icon-192.png", size: 192, scale: 0.72 },
  { out: "public/icons/icon-512.png", size: 512, scale: 0.72 },
  { out: "public/icons/icon-maskable-512.png", size: 512, scale: 0.52 },
  { out: "app/apple-icon.png", size: 180, scale: 0.66 },
];

const page = ({ size, scale }) => `<!doctype html><html><head><style>
  html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden}
  body{background:radial-gradient(120% 90% at 30% 15%, #4a2241 0%, #2a1024 62%);display:grid;place-items:center}
  svg{width:${Math.round(size * scale)}px;height:${Math.round(size * scale)}px}
</style></head><body>
  <svg viewBox="0 3 64 52" xmlns="http://www.w3.org/2000/svg">${BOW}</svg>
</body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), "swipeit-icons-"));
try {
  for (const icon of ICONS) {
    const file = path.join(dir, `icon-${icon.size}-${icon.scale}.html`);
    writeFileSync(file, page(icon));
    const out = path.join(ROOT, icon.out);
    mkdirSync(path.dirname(out), { recursive: true });
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        `--window-size=${icon.size},${icon.size}`,
        `--screenshot=${out}`,
        pathToFileURL(file).href,
      ],
      { stdio: "ignore" },
    );
    console.log(`pwa-icons: ${icon.out}`);
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}
