// Копирует каталог в public/catalog/, откуда его грузит приложение.
//
// Источник — ../catalog/ (данные Товароведа, docs/briefs/TOVAROVED.md). Пока
// Товаровед не сдал products.json, берём заглушку frontend/catalog-stub/
// (TASKS T04). Если Товаровед сдал подарки, а занятий ещё нет — занятия
// берём из заглушки, чтобы «Че делать будем?» не остался пустым.
//
// Запускается сам в predev и prebuild. public/catalog/ — в .gitignore.
//
// Фото подарков и занятий пережимаются (решение владельца от 27.11.2026:
// первый вход на медленной сети): тот же формат и имя файла, качество 55.
// На глаз разницы нет, а вес почти вдвое меньше (349 фото: 17 → 9 МБ).
// Исходники в ../catalog/ не меняются. Пережатое кешируется в
// node_modules/.cache/catalog-images — повторный запуск берёт его оттуда.
import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.resolve(ROOT, "..", "catalog");
const STUB = path.resolve(ROOT, "catalog-stub");
const TARGET = path.resolve(ROOT, "public", "catalog");
const CACHE = path.resolve(ROOT, "node_modules", ".cache", "catalog-images");

const QUALITY = 55;
// Папки с фото внутри каталога: их файлы пережимаются, остальное копируется.
const PHOTO_DIRS = new Set(["products", "activities"]);
const PHOTO_EXT = /\.(?:webp|jpe?g|png)$/i;

// sharp — необязательная тяжёлая зависимость: не загрузился (редкая
// платформа) — фото копируются как есть, сайт работает, только тяжелее.
let sharp = null;
try {
  sharp = (await import("sharp")).default;
} catch (error) {
  console.warn(
    `catalog:sync — sharp не загрузился, фото копируются без сжатия: ${error.message}`,
  );
}

const stats = { files: 0, before: 0, after: 0 };

const encode = async (buffer, ext) => {
  const image = sharp(buffer);
  if (ext === ".webp")
    return image.webp({ quality: QUALITY, effort: 6 }).toBuffer();
  if (ext === ".png")
    return image.png({ quality: QUALITY, palette: true }).toBuffer();
  return image.jpeg({ quality: QUALITY, mozjpeg: true }).toBuffer();
};

// Один файл фото: из кеша, если исходник не менялся, иначе пережать. Вышло
// больше исходника — кладём исходник.
const compressPhoto = async (from, to) => {
  const source = readFileSync(from);
  const ext = path.extname(from).toLowerCase();
  const key = createHash("sha1")
    .update(source)
    .update(`${QUALITY}${ext}`)
    .digest("hex");
  const cached = path.join(CACHE, key + ext);
  let output;
  if (existsSync(cached)) {
    output = readFileSync(cached);
  } else {
    const encoded = await encode(source, ext);
    output = encoded.length < source.length ? encoded : source;
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(cached, output);
  }
  mkdirSync(path.dirname(to), { recursive: true });
  writeFileSync(to, output);
  stats.files += 1;
  stats.before += source.length;
  stats.after += output.length;
};

const copyPhotos = async (from, to) => {
  for (const entry of readdirSync(from)) {
    const source = path.join(from, entry);
    const target = path.join(to, entry);
    if (statSync(source).isDirectory()) await copyPhotos(source, target);
    else if (sharp && PHOTO_EXT.test(entry))
      await compressPhoto(source, target);
    else cpSync(source, target);
  }
};

// Публикуем только данные и фото: отчёт Товароведа и его скрипты проверки на
// сайт не нужны.
const PUBLISHED = [
  "products.json",
  "activities.json",
  "meta.json",
  "products",
  "activities",
];

const count = (file) => {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(data) ? data.length : "?";
  } catch {
    return "битый JSON";
  }
};

const copyFrom = async (dir, names) => {
  for (const name of names) {
    const from = path.join(dir, name);
    if (!existsSync(from)) continue;
    if (PHOTO_DIRS.has(name)) await copyPhotos(from, path.join(TARGET, name));
    else cpSync(from, path.join(TARGET, name), { recursive: true });
  }
};

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

const hasCatalog = existsSync(path.join(SOURCE, "products.json"));
const hasStub = existsSync(path.join(STUB, "products.json"));

if (hasCatalog) {
  await copyFrom(SOURCE, PUBLISHED);
  console.log(
    `catalog:sync — каталог Товароведа: ${count(path.join(SOURCE, "products.json"))} подарков`,
  );
  if (existsSync(path.join(SOURCE, "activities.json"))) {
    console.log(
      `catalog:sync — занятия Товароведа: ${count(path.join(SOURCE, "activities.json"))}`,
    );
  } else if (hasStub) {
    // Вместе с занятиями — и meta.json заглушки: авторы фото в meta.json
    // Товароведа относятся к его занятиям, а не к заглушке.
    await copyFrom(STUB, ["activities.json", "activities", "meta.json"]);
    console.log("catalog:sync — занятий у Товароведа нет, взяты из заглушки");
  }
} else if (hasStub) {
  await copyFrom(STUB, PUBLISHED);
  console.log(
    `catalog:sync — каталога Товароведа нет, взята заглушка: ${count(path.join(STUB, "products.json"))} подарков, ${count(path.join(STUB, "activities.json"))} занятий`,
  );
} else {
  console.warn(
    "catalog:sync — нет ни ../catalog/products.json, ни заглушки catalog-stub/ — public/catalog/ пуст",
  );
}

if (stats.files > 0) {
  const mb = (bytes) => (bytes / 1024 / 1024).toFixed(1);
  console.log(
    `catalog:sync — фото: ${stats.files}, ${mb(stats.before)} → ${mb(stats.after)} МБ (качество ${QUALITY})`,
  );
}
