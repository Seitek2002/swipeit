// Проверка заглушки каталога: node catalog-stub/check-stub.mjs
// Без зависимостей. Печатает OK или список ошибок (код выхода 1).
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const MARKETPLACES = [
  "wildberries",
  "ozon",
  "aliexpress",
  "pinduoduo",
  "temu",
  "amazon",
  "yandex_market",
  "other",
];
const MARKET_HOSTS = {
  wildberries: "https://www.wildberries.ru/",
  ozon: "https://www.ozon.ru/",
  aliexpress: "https://aliexpress.ru/",
  pinduoduo: "https://mobile.yangkeduo.com/",
  temu: "https://www.temu.com/",
  amazon: "https://www.amazon.com/",
  yandex_market: "https://market.yandex.ru/",
};
const CATEGORIES = [
  "tech",
  "beauty",
  "home",
  "kitchen",
  "sport",
  "outdoor",
  "books",
  "hobby",
  "fashion",
  "jewelry",
  "games",
  "kids",
  "auto",
  "pets",
  "experiences",
];
const INTERESTS = [
  "coffee",
  "cooking",
  "gadgets",
  "gaming",
  "boardgames",
  "music",
  "reading",
  "art",
  "photo",
  "fitness",
  "mountains",
  "travel",
  "beauty",
  "fashion",
  "home",
  "plants",
  "pets",
  "cars",
  "wellness",
  "anime",
];
const AUDIENCES = ["all", "female", "male"];
const CURRENCIES = ["RUB", "USD", "CNY", "KGS"];
const RATES = { RUB: 1.0575, USD: 87.45, CNY: 13.1308, KGS: 1 };
const ACT_CATEGORIES = [
  "active",
  "chill",
  "food",
  "culture",
  "nature",
  "party",
  "selfcare",
];
const ACT_TAGS = [
  "outdoor",
  "indoor",
  "kids_ok",
  "evening",
  "weekend",
  "cheap",
  "date",
  "big_group",
];
const SEASONS = ["winter", "spring", "summer", "autumn"];
const CHECKED_AT = "2026-11-27";

const BANDS = [
  { name: "до 1 000", lo: 0, hi: 1000, target: 5 },
  { name: "1 000–3 000", lo: 1000, hi: 3000, target: 7 },
  { name: "3 000–7 000", lo: 3000, hi: 7000, target: 6 },
  { name: "7 000–15 000", lo: 7000, hi: 15000, target: 4 },
  { name: "от 15 000", lo: 15000, hi: Infinity, target: 2 },
];
const bandOf = (p) => BANDS.findIndex((b) => p >= b.lo && p < b.hi);

const isStr = (v) => typeof v === "string" && v.trim().length > 0;
const isInt = (v) => Number.isInteger(v);
const isPrice = (v) => isInt(v) && v > 0 && v % 10 === 0;
const uniq = (arr) => new Set(arr).size === arr.length;
const count = (arr, f) =>
  arr.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});

function checkText(where, field, s, { maxLen } = {}) {
  if (!isStr(s)) return fail(where, `${field} пустой или не строка`);
  if (maxLen && [...s].length > maxLen)
    fail(where, `${field} длиннее ${maxLen} символов (${[...s].length})`);
  if (s.includes("!")) fail(where, `${field} содержит восклицательный знак`);
  if (/[A-ZА-ЯЁ]{5,}/.test(s)) fail(where, `${field} похоже на капслок`);
  if (s !== s.trim() || /  /.test(s)) fail(where, `${field}: лишние пробелы`);
}

function checkSvg(where, src, prefix, w, h) {
  if (!src.startsWith(prefix))
    return fail(where, `src должен начинаться с ${prefix}: ${src}`);
  const file = join(DIR, src.replace(/^\/catalog\//, ""));
  if (!existsSync(file)) return fail(where, `нет файла ${file}`);
  const size = statSync(file).size;
  if (size >= 3072) fail(where, `${src} весит ${size} байт (нужно < 3 КБ)`);
  const text = readFileSync(file, "utf8");
  if (!/<svg[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(text))
    fail(where, `${src}: нет xmlns`);
  if (!text.includes(`viewBox="0 0 ${w} ${h}"`))
    fail(where, `${src}: viewBox не 0 0 ${w} ${h}`);
  if (/<image\b|href=|url\((?!#)|@import/.test(text))
    fail(where, `${src}: внешние ссылки или растровые картинки`);
  if (/&(?!(amp|lt|gt|quot|apos|#\d+);)/.test(text))
    fail(where, `${src}: неэкранированный &`);
  if (!text.trimEnd().endsWith("</svg>"))
    fail(where, `${src}: не закрыт </svg>`);
  return file;
}

function load(name) {
  try {
    return JSON.parse(readFileSync(join(DIR, name), "utf8"));
  } catch (e) {
    fail(name, `не читается: ${e.message}`);
    return [];
  }
}

// ── products ─────────────────────────────────────────────────
const products = load("products.json");
const usedFiles = new Set();
const PRODUCT_KEYS = [
  "id",
  "title",
  "description",
  "category",
  "interests",
  "audience",
  "priceMin",
  "priceMax",
  "images",
  "variants",
  "offers",
  "popularity",
];

if (!Array.isArray(products) || products.length !== 24)
  fail("products.json", `нужно ровно 24 товара, сейчас ${products.length}`);
products.forEach((p, i) => {
  const expectedId = "p_" + String(i + 1).padStart(4, "0");
  const w = p?.id || `products[${i}]`;
  if (p.id !== expectedId) fail(w, `id должен быть ${expectedId}`);
  for (const k of Object.keys(p))
    if (!PRODUCT_KEYS.includes(k)) fail(w, `лишнее поле ${k}`);
  for (const k of PRODUCT_KEYS.filter((k) => k !== "variants"))
    if (!(k in p)) fail(w, `нет поля ${k}`);

  checkText(w, "title", p.title, { maxLen: 60 });
  checkText(w, "description", p.description);
  const paras = String(p.description).split("\n\n");
  if (
    paras.length < 1 ||
    paras.length > 3 ||
    paras.some((x) => !x.trim() || x.includes("\n"))
  )
    fail(w, "description: 1–3 абзаца через \\n\\n");
  if (!CATEGORIES.includes(p.category))
    fail(w, `category вне списка: ${p.category}`);
  if (!AUDIENCES.includes(p.audience))
    fail(w, `audience вне списка: ${p.audience}`);
  if (
    !Array.isArray(p.interests) ||
    p.interests.length < 1 ||
    p.interests.length > 4
  )
    fail(w, "interests: нужно 1–4");
  else {
    if (!uniq(p.interests)) fail(w, "interests с повторами");
    for (const x of p.interests)
      if (!INTERESTS.includes(x)) fail(w, `interest вне списка: ${x}`);
  }
  if (
    typeof p.popularity !== "number" ||
    p.popularity < 0 ||
    p.popularity > 1 ||
    Math.round(p.popularity * 100) / 100 !== p.popularity
  )
    fail(w, `popularity должна быть 0..1 с 2 знаками: ${p.popularity}`);

  // variants
  const optionIds = new Map(); // optionId -> {group, option}
  if ("variants" in p) {
    if (!Array.isArray(p.variants) || p.variants.length === 0)
      fail(w, "variants: пустой массив — лучше убрать поле");
    else {
      if (!uniq(p.variants.map((g) => g.id)))
        fail(w, "variants: повтор id группы");
      for (const g of p.variants) {
        const gw = `${w}.variants.${g.id}`;
        if (!isStr(g.id)) fail(gw, "нет id");
        if (!["color", "size", "other"].includes(g.kind))
          fail(gw, `kind вне списка: ${g.kind}`);
        if (!isStr(g.label)) fail(gw, "нет label");
        if (
          !Array.isArray(g.options) ||
          g.options.length < 2 ||
          g.options.length > 6
        )
          fail(gw, "options: нужно 2–6");
        else {
          if (!uniq(g.options.map((o) => o.id))) fail(gw, "повтор id опции");
          for (const o of g.options) {
            if (!isStr(o.id) || !isStr(o.label))
              fail(gw, "опция без id или label");
            if (g.kind === "color" && !/^#[0-9A-Fa-f]{6}$/.test(o.hex ?? ""))
              fail(gw, `у цвета ${o.id} нет hex #RRGGBB`);
            if (g.kind !== "color" && "hex" in o)
              fail(gw, `hex у не-цветовой опции ${o.id}`);
            for (const k of Object.keys(o))
              if (!["id", "label", "hex"].includes(k))
                fail(gw, `лишнее поле опции ${k}`);
            if (optionIds.has(o.id))
              fail(gw, `id опции ${o.id} повторяется в разных группах`);
            optionIds.set(o.id, { kind: g.kind });
          }
        }
      }
    }
  }

  // images
  if (!Array.isArray(p.images) || p.images.length < 2 || p.images.length > 3)
    fail(w, "images: нужно 2–3");
  else {
    if (!uniq(p.images.map((im) => im.src))) fail(w, "images: повтор src");
    p.images.forEach((im, j) => {
      const iw = `${w}.images[${j}]`;
      for (const k of Object.keys(im))
        if (!["src", "alt", "variantOptionId", "sourceUrl"].includes(k))
          fail(iw, `лишнее поле ${k}`);
      if ("sourceUrl" in im) fail(iw, "в заглушке sourceUrl не ставим");
      checkText(iw, "alt", im.alt);
      if (im.src !== `/catalog/products/${p.id}/${j + 1}.svg`)
        fail(iw, `src должен быть /catalog/products/${p.id}/${j + 1}.svg`);
      const file = checkSvg(iw, im.src, `/catalog/products/${p.id}/`, 600, 750);
      if (file) usedFiles.add(file);
      if ("variantOptionId" in im) {
        const opt = optionIds.get(im.variantOptionId);
        if (!opt)
          fail(iw, `variantOptionId ${im.variantOptionId} нет среди вариантов`);
        else if (opt.kind !== "color")
          fail(
            iw,
            `variantOptionId ${im.variantOptionId} указывает не на цвет`,
          );
      }
    });
    for (const [oid, o] of optionIds)
      if (o.kind === "color") {
        const n = p.images.filter((im) => im.variantOptionId === oid).length;
        if (n !== 1)
          fail(w, `у цвета ${oid} должно быть ровно одно фото (сейчас ${n})`);
      }
  }

  // offers
  if (!Array.isArray(p.offers) || p.offers.length < 1 || p.offers.length > 3)
    fail(w, "offers: нужно 1–3");
  else {
    if (!uniq(p.offers.map((o) => o.marketplace)))
      fail(w, "offers: магазины должны быть разными");
    p.offers.forEach((o, j) => {
      const ow = `${w}.offers[${j}]`;
      for (const k of Object.keys(o))
        if (
          ![
            "marketplace",
            "url",
            "price",
            "originalPrice",
            "originalCurrency",
            "checkedAt",
          ].includes(k)
        )
          fail(ow, `лишнее поле ${k}`);
      if (!MARKETPLACES.includes(o.marketplace))
        fail(ow, `marketplace вне списка: ${o.marketplace}`);
      if (!isStr(o.url) || !/^https:\/\/\S+$/.test(o.url))
        fail(ow, `url не https: ${o.url}`);
      else if (
        MARKET_HOSTS[o.marketplace] &&
        !o.url.startsWith(MARKET_HOSTS[o.marketplace])
      )
        fail(ow, `url не с сайта ${o.marketplace}: ${o.url}`);
      if (/[?&](utm_|sid=)/.test(o.url ?? ""))
        fail(ow, "url с трекинговым хвостом");
      if (!isPrice(o.price))
        fail(ow, `price должна быть целой, > 0 и кратной 10: ${o.price}`);
      if (o.checkedAt !== CHECKED_AT)
        fail(ow, `checkedAt должен быть ${CHECKED_AT}`);
      const hasP = "originalPrice" in o,
        hasC = "originalCurrency" in o;
      if (hasP !== hasC)
        fail(ow, "originalPrice и originalCurrency ставятся вместе");
      if (hasC) {
        if (!CURRENCIES.includes(o.originalCurrency))
          fail(ow, `originalCurrency вне списка: ${o.originalCurrency}`);
        else if (typeof o.originalPrice !== "number" || o.originalPrice <= 0)
          fail(ow, "originalPrice должна быть > 0");
        else {
          const expected =
            Math.round((o.originalPrice * RATES[o.originalCurrency]) / 10) * 10;
          if (expected !== o.price)
            fail(
              ow,
              `по курсу ${o.originalPrice} ${o.originalCurrency} = ${expected} сом, а записано ${o.price}`,
            );
        }
      }
    });
    const prices = p.offers.map((o) => o.price);
    if (!isPrice(p.priceMin) || !isPrice(p.priceMax))
      fail(w, "priceMin/priceMax должны быть целыми и кратными 10");
    if (p.priceMin > p.priceMax) fail(w, "priceMin > priceMax");
    if (p.priceMin !== Math.min(...prices))
      fail(
        w,
        `priceMin ${p.priceMin} ≠ минимуму офферов ${Math.min(...prices)}`,
      );
    if (p.priceMax !== Math.max(...prices))
      fail(
        w,
        `priceMax ${p.priceMax} ≠ максимуму офферов ${Math.max(...prices)}`,
      );
    if (bandOf(p.priceMin) !== bandOf(p.priceMax))
      fail(w, "priceMin и priceMax в разных ценовых диапазонах");
  }
});

if (!uniq(products.map((p) => p.id))) fail("products.json", "повтор id");
if (!uniq(products.map((p) => p.title))) fail("products.json", "повтор title");

const byCategory = count(products, (p) => p.category);
if (Object.keys(byCategory).length < 12)
  fail(
    "products.json",
    `нужно ≥ 12 категорий, сейчас ${Object.keys(byCategory).length}`,
  );
const byBand = BANDS.map(
  (b, i) => products.filter((p) => bandOf(p.priceMin) === i).length,
);
BANDS.forEach((b, i) => {
  if (Math.abs(byBand[i] - b.target) > 1)
    fail(
      "products.json",
      `диапазон ${b.name}: ${byBand[i]} товаров, ждём ≈${b.target}`,
    );
});
const byAudience = count(products, (p) => p.audience);
for (const [a, t] of [
  ["all", 12],
  ["female", 6],
  ["male", 6],
])
  if (Math.abs((byAudience[a] || 0) - t) > 1)
    fail("products.json", `audience ${a}: ${byAudience[a] || 0}, ждём ≈${t}`);
const withVariants = products.filter((p) => p.variants?.length);
if (withVariants.length < 6)
  fail(
    "products.json",
    `вариантов должно быть хотя бы у 6 товаров, сейчас ${withVariants.length}`,
  );
const kinds = new Set(
  withVariants.flatMap((p) => p.variants.map((g) => g.kind)),
);
if (!kinds.has("color") || !kinds.has("size"))
  fail("products.json", "нужны и цветовые, и размерные варианты");
const allOffers = products.flatMap((p) => p.offers || []);
const withOrig = allOffers.filter((o) => "originalPrice" in o).length;
if (withOrig * 2 <= allOffers.length)
  fail(
    "products.json",
    `исходная цена есть только у ${withOrig} из ${allOffers.length} офферов`,
  );

// ── activities ───────────────────────────────────────────────
const activities = load("activities.json");
const ACT_KEYS = [
  "id",
  "title",
  "description",
  "category",
  "tags",
  "pricePerPersonMin",
  "pricePerPersonMax",
  "durationMin",
  "durationMax",
  "seasons",
  "groupSize",
  "place",
  "distanceNote",
  "image",
];
const ACT_OPTIONAL = ["place", "distanceNote"];

if (!Array.isArray(activities) || activities.length !== 12)
  fail(
    "activities.json",
    `нужно ровно 12 занятий, сейчас ${activities.length}`,
  );
activities.forEach((a, i) => {
  const expectedId = "a_" + String(i + 1).padStart(3, "0");
  const w = a?.id || `activities[${i}]`;
  if (a.id !== expectedId) fail(w, `id должен быть ${expectedId}`);
  for (const k of Object.keys(a))
    if (!ACT_KEYS.includes(k)) fail(w, `лишнее поле ${k}`);
  for (const k of ACT_KEYS.filter((k) => !ACT_OPTIONAL.includes(k)))
    if (!(k in a)) fail(w, `нет поля ${k}`);
  checkText(w, "title", a.title, { maxLen: 60 });
  checkText(w, "description", a.description);
  if (!ACT_CATEGORIES.includes(a.category))
    fail(w, `category вне списка: ${a.category}`);
  if (!Array.isArray(a.tags) || a.tags.length === 0)
    fail(w, "tags: хотя бы один");
  else {
    if (!uniq(a.tags)) fail(w, "tags с повторами");
    for (const t of a.tags)
      if (!ACT_TAGS.includes(t)) fail(w, `tag вне списка: ${t}`);
    if (a.tags.includes("indoor") && a.tags.includes("outdoor"))
      fail(w, "indoor и outdoor одновременно");
  }
  if (!Array.isArray(a.seasons)) fail(w, "seasons должен быть массивом");
  else {
    if (!uniq(a.seasons)) fail(w, "seasons с повторами");
    for (const s of a.seasons)
      if (!SEASONS.includes(s)) fail(w, `season вне списка: ${s}`);
    if (a.seasons.length === 4) fail(w, "все 4 сезона — пиши пустой массив");
  }
  if (!isPrice(a.pricePerPersonMin) || !isPrice(a.pricePerPersonMax))
    fail(w, "цены должны быть целыми, > 0, кратными 10");
  if (a.pricePerPersonMin > a.pricePerPersonMax)
    fail(w, "pricePerPersonMin > pricePerPersonMax");
  if (
    !isInt(a.durationMin) ||
    !isInt(a.durationMax) ||
    a.durationMin <= 0 ||
    a.durationMin > a.durationMax
  )
    fail(w, "durationMin/Max: целые минуты, min ≤ max");
  const g = a.groupSize;
  if (
    !g ||
    !isInt(g.min) ||
    g.min < 1 ||
    !(g.max === null || (isInt(g.max) && g.max >= g.min)) ||
    Object.keys(g).some((k) => !["min", "max"].includes(k)) ||
    !("max" in g)
  )
    fail(w, `groupSize некорректен: ${JSON.stringify(g)}`);
  if ("place" in a) checkText(w, "place", a.place);
  if ("distanceNote" in a) {
    checkText(w, "distanceNote", a.distanceNote);
    if (!/от города$/.test(a.distanceNote))
      fail(w, "distanceNote в формате «40 минут от города»");
  }
  if ("isCustom" in a || "createdBy" in a)
    fail(w, "isCustom/createdBy в каталоге не ставим");
  if (!a.image || !isStr(a.image.src)) fail(w, "нет image.src");
  else {
    for (const k of Object.keys(a.image))
      if (!["src", "alt"].includes(k)) fail(w, `image: лишнее поле ${k}`);
    checkText(w, "image.alt", a.image.alt);
    if (a.image.src !== `/catalog/activities/${a.id}.svg`)
      fail(w, `image.src должен быть /catalog/activities/${a.id}.svg`);
    const file = checkSvg(w, a.image.src, "/catalog/activities/", 1280, 800);
    if (file) usedFiles.add(file);
  }
});
if (!uniq(activities.map((a) => a.id))) fail("activities.json", "повтор id");
const actCats = new Set(activities.map((a) => a.category));
for (const c of ACT_CATEGORIES)
  if (!actCats.has(c))
    fail("activities.json", `не использована категория ${c}`);

// ── лишние файлы картинок ────────────────────────────────────
const walk = (d) =>
  existsSync(d)
    ? readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
      )
    : [];
for (const f of [
  ...walk(join(DIR, "products")),
  ...walk(join(DIR, "activities")),
])
  if (!usedFiles.has(f)) fail("files", `файл ни на что не ссылается: ${f}`);

// ── итог ─────────────────────────────────────────────────────
if (errors.length) {
  console.error(`FAIL: ${errors.length} ошибок`);
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
const fmt = (o) =>
  Object.entries(o)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ");
console.log(
  `OK: ${products.length} товаров, ${activities.length} занятий, ${usedFiles.size} SVG`,
);
console.log(`  категории: ${fmt(byCategory)}`);
console.log(
  `  цены: ${BANDS.map((b, i) => `${b.name} — ${byBand[i]}`).join("; ")}`,
);
console.log(`  audience: ${fmt(byAudience)}`);
console.log(
  `  с вариантами (${withVariants.length}): ${withVariants.map((p) => `${p.id} ${p.variants.map((g) => g.kind).join("+")}`).join(", ")}`,
);
console.log(`  офферы: ${allOffers.length}, с исходной ценой ${withOrig}`);
console.log(
  `  занятия по категориям: ${fmt(count(activities, (a) => a.category))}`,
);
