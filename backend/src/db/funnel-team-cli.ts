import { eq } from "drizzle-orm";

import { loadConfig } from "../config";
import { createDb } from "./client";
import { shareLinks, users } from "./schema";

// npm run funnel:team -w backend -- <код короткой ссылки> [--undo]
// npm run funnel:team -w backend -- --user <id> [--undo]
// Пометить свой профиль команды (Q03): его шаги воронка не считает. Код —
// с короткой ссылки своего вишлиста: id профиля в интерфейсе не виден.
const args = process.argv.slice(2);
const undo = args.includes("--undo");
const userFlag = args.indexOf("--user");
const userArg = userFlag === -1 ? undefined : args[userFlag + 1];
const code = args.find(
  (arg, index) => !arg.startsWith("--") && args[index - 1] !== "--user",
);
if (!userArg && !code) {
  console.error("Нужен код короткой ссылки или --user <id>");
  process.exit(1);
}

const config = loadConfig();
const database = createDb(config.DATABASE_URL, 1);
try {
  let userId = userArg;
  if (!userId && code) {
    const [link] = await database.db
      .select({ ownerId: shareLinks.ownerId })
      .from(shareLinks)
      .where(eq(shareLinks.code, code))
      .limit(1);
    userId = link?.ownerId;
  }
  const [row] = userId
    ? await database.db
        .update(users)
        .set({ funnelInternal: !undo })
        .where(eq(users.id, userId))
        .returning({ id: users.id })
    : [];
  if (!row) {
    console.error(code && !userArg ? "Ссылка не найдена" : "Профиль не найден");
    process.exitCode = 1;
  } else {
    console.log(
      undo
        ? "Пометка снята: шаги профиля снова считаются."
        : "Профиль помечен своим: дальше его шаги не считаются. Уже набранные счётчики остаются как есть.",
    );
  }
} finally {
  await database.close();
}
