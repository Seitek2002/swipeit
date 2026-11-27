import pg from "pg";

import { createDb } from "../src/db/client";
import { runMigrations } from "../src/db/migrate";
import { testDatabaseUrl } from "./db";

// Перед всеми тестами — чистая тестовая база с миграциями (BACKEND.md B03).
// Каждый прогон пересоздаёт её: тесты не зависят от прошлых данных.
export default async function setup() {
  const url = new URL(testDatabaseUrl());
  const name = url.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    await client.query(`drop database if exists "${name}" with (force)`);
    await client.query(`create database "${name}"`);
  } finally {
    await client.end();
  }
  const database = createDb(url.toString(), 1);
  try {
    await runMigrations(database.db);
  } finally {
    await database.close();
  }
}
