// Проверка каталога Товароведа (docs/briefs/TOVAROVED.md, §7).
// Запуск из корня проекта: node catalog/check.mjs
// Код выхода 1 — есть ошибки; предупреждения (доли) код выхода не меняют.
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const errors = [];
const warns = [];
const err = (m) => errors.push(m);
const warn = (m) => warns.push(m);

const CATEGORIES = {
  tech: 16, beauty: 11, home: 11, kitchen: 10, fashion: 10, sport: 9, hobby: 9, games: 9,
  outdoor: 8, books: 6, jewelry: 7, kids: 6, auto: 4, pets: 4, experiences: 0,
};
const INTERESTS = new Set(["coffee", "cooking", "gadgets", "gaming", "boardgames", "music", "reading", "art", "photo",
  "fitness", "mountains", "travel", "beauty", "fashion", "home", "plants", "pets", "cars", "wellness", "anime"]);
const AUDIENCE = new Set(["all", "female", "male"]);
const MARKETS = new Set(["wildberries", "ozon", "aliexpress", "pinduoduo", "temu", "amazon", "yandex_market", "other"]);
const CURRENCIES = new Set(["RUB", "USD", "CNY", "KGS"]);
const ACT_CATS = new Set(["active", "chill", "food", "culture", "nature", "party", "selfcare"]);
const TAGS = new Set(["outdoor", "indoor", "kids_ok", "evening", "weekend", "cheap", "date", "big_group"]);
const SEASONS = new Set(["winter", "spring", "summer", "autumn"]);
const BANDS = [["до 1 000", 0, 999, 0.2], ["1 000 – 3 000", 1000, 2999, 0.3], ["3 000 – 7 000", 3000, 6999, 0.25],
  ["7 000 – 15 000", 7000, 14999, 0.15], ["от 15 000", 15000, Infinity, 0.1]];

const readJson = (name) => {
  try {
    return JSON.parse(readFileSync(path.join(DIR, name), "utf8"));
  } catch (e) {
    err(`${name}: не читается как JSON (${e.message})`);
    return null;
  }
};

// Размер WebP по заголовку (VP8 / VP8L / VP8X).
const webpInfo = (file) => {
  const b = readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") return null;
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8 ") return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if (chunk === "VP8L") {
    const v = b.readUInt32LE(21);
    return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  return null;
};

const checkImage = (where, src, maxSide, maxBytes) => {
  if (typeof src !== "string" || !src.startsWith("/catalog/")) return err(`${where}: src должен начинаться с /catalog/ (${src})`);
  const file = path.join(DIR, src.replace(/^\/catalog\//, ""));
  if (!existsSync(file)) return err(`${where}: нет файла ${src}`);
  const info = webpInfo(file);
  if (!info) return err(`${where}: ${src} — не WebP`);
  if (Math.max(info.w, info.h) > maxSide) err(`${where}: ${src} — ${info.w}×${info.h}, больше ${maxSide}px`);
  const size = statSync(file).size;
  if (size > maxBytes) err(`${where}: ${src} — ${Math.round(size / 1024)} КБ, больше ${maxBytes / 1000} КБ`);
};

const badTitle = (t) => /[A-ZА-ЯЁ]{4,}/.test(t.replace(/\b(TPE|XPPen|USB|PS5|RFID|GAN|ZYFeeder)\b/g, ""))
  || /[^\p{L}\p{N}\s«»"'.,:;()\-–—×+№/&%]/u.test(t);
const isInt10 = (n) => Number.isInteger(n) && n % 10 === 0;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const pct = (n, total) => (total ? (100 * n) / total : 0);

// ── Подарки ──────────────────────────────────────────────────
const products = readJson("products.json") || [];
const seenTitles = new Map();
const seenUrls = new Map();
products.forEach((p, i) => {
  const at = p.id || `#${i}`;
  const expected = `p_${String(i + 1).padStart(4, "0")}`;
  if (p.id !== expected) err(`${at}: id идут не по порядку (ожидался ${expected})`);
  if (typeof p.title !== "string" || !p.title || p.title.length > 60) err(`${at}: title пустой или длиннее 60`);
  else if (badTitle(p.title)) err(`${at}: в title капслок или лишние символы: «${p.title}»`);
  if (typeof p.description !== "string" || p.description.length < 30) err(`${at}: короткое description`);
  else if (p.description.includes("!")) err(`${at}: восклицательный знак в description`);
  if (!(p.category in CATEGORIES)) err(`${at}: неизвестная category ${p.category}`);
  if (!Array.isArray(p.interests) || p.interests.length < 1 || p.interests.length > 4) err(`${at}: interests — от 1 до 4`);
  else p.interests.forEach((x) => INTERESTS.has(x) || err(`${at}: неизвестный interest ${x}`));
  if (!AUDIENCE.has(p.audience)) err(`${at}: audience ${p.audience}`);
  if (!isInt10(p.priceMin) || !isInt10(p.priceMax) || p.priceMin <= 0 || p.priceMin > p.priceMax)
    err(`${at}: цены ${p.priceMin}–${p.priceMax} (нужно > 0, кратно 10, min ≤ max)`);
  if (typeof p.popularity !== "number" || p.popularity < 0 || p.popularity > 1) err(`${at}: popularity вне 0..1`);

  const optionIds = new Set();
  for (const g of p.variants || []) {
    if (!g.id || !["color", "size", "other"].includes(g.kind) || !g.label) err(`${at}: группа вариантов ${g.id} без id/kind/label`);
    if (!Array.isArray(g.options) || g.options.length < 1 || g.options.length > 6) err(`${at}: в группе ${g.id} 1–6 опций`);
    for (const o of g.options || []) {
      if (!o.id || !o.label) err(`${at}: опция без id/label в ${g.id}`);
      if (g.kind === "color" && !/^#[0-9A-Fa-f]{6}$/.test(o.hex || "")) err(`${at}: у цвета ${o.id} нет hex`);
      optionIds.add(o.id);
    }
  }
  if (!Array.isArray(p.images) || p.images.length < 2 || p.images.length > 5) err(`${at}: фото должно быть 2–5`);
  (p.images || []).forEach((im, k) => {
    checkImage(`${at} фото ${k + 1}`, im.src, 1080, 200_000);
    if (!im.alt) err(`${at} фото ${k + 1}: нет alt`);
    if (typeof im.sourceUrl !== "string" || !/^https:\/\//.test(im.sourceUrl)) err(`${at} фото ${k + 1}: нет sourceUrl`);
    if (im.variantOptionId && !optionIds.has(im.variantOptionId)) err(`${at} фото ${k + 1}: нет опции ${im.variantOptionId}`);
  });
  if (!Array.isArray(p.offers) || p.offers.length < 1) err(`${at}: нет offers`);
  (p.offers || []).forEach((o, k) => {
    if (!MARKETS.has(o.marketplace)) err(`${at} оффер ${k + 1}: marketplace ${o.marketplace}`);
    if (!/^https:\/\//.test(o.url || "") || /[?&](utm_|sid|spm)/.test(o.url)) err(`${at} оффер ${k + 1}: url без https или с трекингом`);
    if (!isInt10(o.price) || o.price < p.priceMin || o.price > p.priceMax) err(`${at} оффер ${k + 1}: price ${o.price} вне цены товара`);
    if (o.originalCurrency && !CURRENCIES.has(o.originalCurrency)) err(`${at} оффер ${k + 1}: валюта ${o.originalCurrency}`);
    if (!isDate(o.checkedAt)) err(`${at} оффер ${k + 1}: checkedAt`);
    const prev = seenUrls.get(o.url);
    if (prev) err(`${at}: тот же оффер, что у ${prev}`);
    seenUrls.set(o.url, at);
  });
  const key = (p.title || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  if (seenTitles.has(key)) err(`${at}: дубль названия ${seenTitles.get(key)}`);
  seenTitles.set(key, at);
});

// ── Занятия ──────────────────────────────────────────────────
const activities = readJson("activities.json") || [];
activities.forEach((a, i) => {
  const at = a.id || `#${i}`;
  const expected = `a_${String(i + 1).padStart(3, "0")}`;
  if (a.id !== expected) err(`${at}: id идут не по порядку (ожидался ${expected})`);
  if (!a.title || a.title.length > 60 || badTitle(a.title)) err(`${at}: title`);
  if (!a.description || a.description.includes("!")) err(`${at}: description`);
  if (!ACT_CATS.has(a.category)) err(`${at}: category ${a.category}`);
  (a.tags || []).forEach((t) => TAGS.has(t) || err(`${at}: tag ${t}`));
  (a.seasons || []).forEach((s) => SEASONS.has(s) || err(`${at}: season ${s}`));
  if (!Array.isArray(a.tags) || !Array.isArray(a.seasons)) err(`${at}: tags/seasons — массивы`);
  for (const k of ["pricePerPersonMin", "pricePerPersonMax", "durationMin", "durationMax"])
    if (!Number.isInteger(a[k]) || a[k] < 0) err(`${at}: ${k}`);
  if (a.pricePerPersonMin > a.pricePerPersonMax || a.durationMin > a.durationMax) err(`${at}: min > max`);
  const g = a.groupSize || {};
  if (!Number.isInteger(g.min) || g.min < 1 || !(g.max === null || (Number.isInteger(g.max) && g.max >= g.min))) err(`${at}: groupSize`);
  if (!a.image) err(`${at}: нет image`);
  else {
    checkImage(`${at} фото`, a.image.src, 1280, 250_000);
    if (!a.image.alt) err(`${at}: нет alt у фото`);
  }
});

// ── meta.json ────────────────────────────────────────────────
const meta = readJson("meta.json") || {};
if (!isDate(meta.collectedAt || "")) err("meta.json: collectedAt");
for (const c of ["RUB", "USD", "CNY"]) if (!(meta.rates?.[c] > 0)) err(`meta.json: курс ${c}`);
const credited = new Set((meta.activityPhotoCredits || []).map((c) => c.activityId));
activities.forEach((a) => credited.has(a.id) || err(`${a.id}: нет автора фото в meta.json`));
(meta.activityPhotoCredits || []).forEach((c) => {
  if (!(c.author && c.url && c.license)) err(`meta.json: неполный credit ${c.activityId}`);
  if (/(NC|ND)/.test(c.license || "")) err(`meta.json: ${c.activityId} — лицензия с NC/ND (${c.license})`);
});

// ── Доли ─────────────────────────────────────────────────────
const n = products.length;
const report = [];
report.push(`Подарков: ${n}, занятий: ${activities.length}`);
report.push("Категории (факт / цель по таблице):");
const totalTarget = Object.values(CATEGORIES).reduce((a, b) => a + b, 0);
for (const [cat, target] of Object.entries(CATEGORIES)) {
  const c = products.filter((p) => p.category === cat).length;
  const fact = pct(c, n);
  const goal = pct(target, totalTarget);
  report.push(`  ${cat.padEnd(12)} ${String(c).padStart(3)}  ${fact.toFixed(1).padStart(5)}% / ${goal.toFixed(1)}%`);
  if (Math.abs(fact - goal) > 5) warn(`категория ${cat}: ${fact.toFixed(1)}% против ${goal.toFixed(1)}%`);
}
report.push("Цены по priceMin (факт / цель):");
for (const [label, lo, hi, share] of BANDS) {
  const c = products.filter((p) => p.priceMin >= lo && p.priceMin <= hi).length;
  const fact = pct(c, n);
  report.push(`  ${label.padEnd(16)} ${String(c).padStart(3)}  ${fact.toFixed(1).padStart(5)}% / ${(share * 100).toFixed(0)}%`);
  if (Math.abs(fact - share * 100) > 5) warn(`цены ${label}: ${fact.toFixed(1)}% против ${share * 100}%`);
}
report.push("Аудитория (факт / цель):");
for (const [aud, min] of [["all", 0], ["female", 20], ["male", 20]]) {
  const c = products.filter((p) => p.audience === aud).length;
  report.push(`  ${aud.padEnd(8)} ${String(c).padStart(3)}  ${pct(c, n).toFixed(1).padStart(5)}%${min ? ` / не меньше ${min}%` : ""}`);
  if (min && pct(c, n) < min) warn(`аудитория ${aud}: ${pct(c, n).toFixed(1)}%, нужно не меньше ${min}%`);
}
const actCats = {};
activities.forEach((a) => (actCats[a.category] = (actCats[a.category] || 0) + 1));
report.push(`Занятия по категориям: ${Object.entries(actCats).map(([k, v]) => `${k} ${v}`).join(", ")}`);
report.push(`Только зимние занятия: ${activities.filter((a) => a.seasons.length === 1 && a.seasons[0] === "winter").length}, круглый год: ${activities.filter((a) => a.seasons.length === 0).length}`);

console.log(report.join("\n"));
console.log(`\nПредупреждения (${warns.length}):${warns.length ? "\n  - " + warns.join("\n  - ") : " нет"}`);
console.log(`Ошибки (${errors.length}):${errors.length ? "\n  - " + errors.join("\n  - ") : " нет"}`);
process.exit(errors.length ? 1 : 0);
