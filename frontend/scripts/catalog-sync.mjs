// Копирует каталог в public/catalog/, откуда его грузит приложение.
//
// Источник — ../catalog/ (данные Товароведа, docs/briefs/TOVAROVED.md). Пока
// Товаровед не сдал products.json, берём заглушку frontend/catalog-stub/
// (TASKS T04). Если Товаровед сдал подарки, а занятий ещё нет — занятия
// берём из заглушки, чтобы «Че делать будем?» не остался пустым.
//
// Запускается сам в predev и prebuild. public/catalog/ — в .gitignore.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = path.resolve(ROOT, "..", "catalog");
const STUB = path.resolve(ROOT, "catalog-stub");
const TARGET = path.resolve(ROOT, "public", "catalog");

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

const copyFrom = (dir, names) => {
  for (const name of names) {
    const from = path.join(dir, name);
    if (existsSync(from))
      cpSync(from, path.join(TARGET, name), { recursive: true });
  }
};

rmSync(TARGET, { recursive: true, force: true });
mkdirSync(TARGET, { recursive: true });

const hasCatalog = existsSync(path.join(SOURCE, "products.json"));
const hasStub = existsSync(path.join(STUB, "products.json"));

if (hasCatalog) {
  copyFrom(SOURCE, PUBLISHED);
  console.log(
    `catalog:sync — каталог Товароведа: ${count(path.join(SOURCE, "products.json"))} подарков`,
  );
  if (existsSync(path.join(SOURCE, "activities.json"))) {
    console.log(
      `catalog:sync — занятия Товароведа: ${count(path.join(SOURCE, "activities.json"))}`,
    );
  } else if (hasStub) {
    copyFrom(STUB, ["activities.json", "activities"]);
    console.log("catalog:sync — занятий у Товароведа нет, взяты из заглушки");
  }
} else if (hasStub) {
  copyFrom(STUB, PUBLISHED);
  console.log(
    `catalog:sync — каталога Товароведа нет, взята заглушка: ${count(path.join(STUB, "products.json"))} подарков, ${count(path.join(STUB, "activities.json"))} занятий`,
  );
} else {
  console.warn(
    "catalog:sync — нет ни ../catalog/products.json, ни заглушки catalog-stub/ — public/catalog/ пуст",
  );
}
