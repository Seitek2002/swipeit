// Генерирует картинку превью ссылки public/og.png (1200×630) — TECH_SPEC §13.
// Запускается вручную один раз: `node scripts/og-image.mjs`. Результат лежит
// в репозитории, в сборку скрипт не входит.
//
// Как: собираем HTML-страницу с токенами и шрифтами из DESIGN.md и снимаем её
// headless Chrome. Путь к Chrome — из CHROME_PATH или стандартных мест.
// Шрифты грузятся с Google Fonts, поэтому нужен интернет.
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "og.png");

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
  console.error("og-image: не нашёл Chrome. Укажи путь в CHROME_PATH.");
  process.exit(1);
}

// Иллюстрации бирок — из docs/design/reference.html (тонированная бумага +
// контурный предмет), чтобы превью выглядело как сам продукт.
const mix = (c, p) => `color-mix(in srgb, var(--${c}) ${p}%, var(--paper))`;
const tint = (c, p) =>
  `linear-gradient(165deg, ${mix(c, p)} 0%, var(--paper-2) 100%)`;
const f = (c) => `style="fill:${c}"`;
const floor = (cx, cy, rx) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="5" style="fill:rgb(42 16 36 / .09);stroke:none"/>`;
const svg = (body) =>
  `<svg class="illus" viewBox="0 0 160 160" aria-hidden="true">${body}</svg>`;

const ILL = {
  candle: svg(`${floor(80, 138, 40)}
    <circle cx="80" cy="36" r="24" style="fill:rgb(255 138 61 / .14);stroke:none"/>
    <path d="M50 70h60v52a12 12 0 0 1-12 12H62a12 12 0 0 1-12-12z" ${f(mix("champagne", 78))}/>
    <rect x="47" y="62" width="66" height="11" rx="4" ${f("var(--paper-2)")}/>
    <rect x="61" y="88" width="38" height="28" rx="4" ${f("var(--paper)")}/>
    <path d="M69 98h22M73 106h14" style="stroke:var(--ink-soft);stroke-width:1.8"/>
    <path d="M80 62v-9"/>
    <path d="M80 52c-8-7-6-17 0-26 6 9 8 19 0 26z" style="fill:var(--mandarin);stroke-width:1.8"/>
    <path d="M80 47c-3-3-2-7 0-10 2 3 3 7 0 10z" style="fill:var(--champagne);stroke:none"/>`),
  headphones: svg(`${floor(80, 140, 46)}
    <path d="M38 98V82a42 42 0 0 1 84 0v16" style="stroke-width:11"/>
    <path d="M38 98V82a42 42 0 0 1 84 0v16" style="stroke:var(--paper);stroke-width:6.5"/>
    <rect x="24" y="88" width="28" height="44" rx="13" ${f("var(--paper)")}/><rect x="108" y="88" width="28" height="44" rx="13" ${f("var(--paper)")}/>
    <rect x="47" y="96" width="9" height="28" rx="4.5" ${f("var(--paper-2)")}/><rect x="104" y="96" width="9" height="28" rx="4.5" ${f("var(--paper-2)")}/>
    <circle cx="124" cy="104" r="2.6" style="fill:var(--mandarin);stroke:none"/>`),
  camera: svg(`${floor(80, 144, 46)}
    <rect x="58" y="114" width="44" height="26" rx="2" ${f("var(--paper)")}/>
    <rect x="63" y="118" width="34" height="16" rx="1" style="fill:${mix("champagne", 55)};stroke:none"/>
    <rect x="98" y="40" width="16" height="8" rx="2" ${f("var(--paper-2)")}/>
    <rect x="32" y="46" width="96" height="74" rx="17" ${f(mix("mint", 72))}/>
    <rect x="42" y="56" width="20" height="12" rx="3" ${f("var(--paper)")}/>
    <rect x="104" y="56" width="14" height="10" rx="2.5" ${f("var(--paper-2)")}/>
    <circle cx="80" cy="86" r="24" ${f("var(--paper)")}/>
    <circle cx="80" cy="86" r="13" ${f("var(--ink-soft)")}/>
    <circle cx="75" cy="81" r="3.5" style="fill:var(--paper);stroke:none"/>
    <circle cx="116" cy="106" r="3" style="fill:var(--mandarin);stroke:none"/>`),
};

const BOW = `<svg class="bow" viewBox="0 0 64 44" aria-hidden="true">
  <path d="M32 20C24 5 5 2 5 14s19 11 27 6z"/><path d="M32 20c8-15 27-18 27-6s-19 11-27 6z"/>
  <path class="tail" d="M30 23c-4 8-8 13-14 19"/><path class="tail" d="M34 23c4 8 8 13 14 19"/>
  <path class="fold" d="M30 19c-6-6-14-8-18-6M34 19c6-6 14-8 18-6"/>
  <circle cx="32" cy="20" r="5"/></svg>`;

const tag = (ill, bg, { x, len, rot }) => `
  <div class="hang" style="left:${x}px;transform:rotate(${rot}deg)">
    <span class="string" style="height:${len}px"></span>
    <div class="tag paper"><div class="photo" style="background:${bg}">${ill}</div></div>
  </div>`;

const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;1,600&family=Onest:wght@500&display=block" rel="stylesheet">
<style>
:root { --velvet:#2a1024; --paper:#fff1f3; --paper-2:#f6e1e7; --ink:#2a1024; --ink-soft:#7a5a6e;
  --rose:#cba8bc; --mandarin:#ff8a3d; --mandarin-ink:#b8460e; --mint:#8fe3c6; --champagne:#ffd27a; }
* { margin:0; padding:0; box-sizing:border-box; }
html, body { width:1200px; height:630px; overflow:hidden; }
body { position:relative; background: radial-gradient(120% 60% at 50% -10%, rgb(255 138 61 / .14), transparent 60%), var(--velvet);
  color:var(--paper); font-family:"Onest", sans-serif; }
body::after { content:""; position:absolute; inset:0; background-image:${GRAIN}; opacity:.06; mix-blend-mode:overlay; }
.copy { position:absolute; left:84px; top:0; bottom:0; width:600px; display:flex; flex-direction:column; justify-content:center; }
.brand { display:flex; align-items:center; gap:16px; }
.bow { width:84px; height:58px; overflow:visible; }
.bow path, .bow circle { fill:var(--mandarin); stroke:var(--mandarin); stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
.bow .tail { fill:none; stroke-width:4; }
.bow .fold { fill:none; stroke:var(--mandarin-ink); stroke-width:1.6; }
.word { font:italic 600 60px/1 "Cormorant Garamond", serif; letter-spacing:-0.01em; }
h1 { font:600 64px/68px "Cormorant Garamond", serif; letter-spacing:-0.01em; margin-top:40px; }
p { font:500 26px/36px "Onest", sans-serif; color:var(--rose); margin-top:22px; }
.hang { position:absolute; top:-24px; width:168px; transform-origin:50% 0; filter:drop-shadow(0 22px 24px rgb(10 0 8 / .45)); }
.string { display:block; width:2px; margin:0 auto; background:var(--rose); }
.tag { height:212px; margin-top:-18px; border-radius:24px; padding:38px 11px 11px; display:flex;
  -webkit-mask: radial-gradient(circle 8px at 50% 19px, #0000 96%, #000 100%); mask: radial-gradient(circle 8px at 50% 19px, #0000 96%, #000 100%);
  box-shadow: 0 1px 0 rgb(255 255 255 / .6) inset; }
.paper { position:relative; background:var(--paper); }
.paper::before { content:""; position:absolute; left:50%; top:19px; width:28px; height:28px; margin:-14px 0 0 -14px; border-radius:50%; border:3.5px solid var(--paper-2); }
.photo { flex:1; border-radius:16px; display:grid; place-items:center; overflow:hidden; }
svg.illus { width:96%; height:96%; overflow:visible; stroke:var(--ink); stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; fill:none; }
</style></head><body>
  ${tag(ILL.candle, tint("rose", 62), { x: 742, len: 210, rot: -7 })}
  ${tag(ILL.headphones, tint("champagne", 62), { x: 902, len: 300, rot: 3 })}
  ${tag(ILL.camera, tint("mint", 55), { x: 1040, len: 150, rot: 9 })}
  <div class="copy">
    <div class="brand">${BOW}<span class="word">swipeit</span></div>
    <h1>Свайпай подарки, которые хочется тебе.</h1>
    <p>Друзья увидят — и угадают с подарком.</p>
  </div>
</body></html>`;

const dir = mkdtempSync(path.join(tmpdir(), "swipeit-og-"));
const page = path.join(dir, "og.html");
writeFileSync(page, html);
try {
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--window-size=1200,630",
      // Ждём, пока подгрузятся шрифты Google Fonts (display=block).
      "--virtual-time-budget=8000",
      `--screenshot=${OUT}`,
      pathToFileURL(page).href,
    ],
    { stdio: "inherit" },
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`og-image: ${OUT} (${Math.round(statSync(OUT).size / 1024)} КБ)`);
