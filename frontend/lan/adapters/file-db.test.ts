import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Db, createEmptyDb, parseDb } from "@/shared/api/mock-server/db";
import { AVATAR_COLORS } from "@/shared/config";

import { createFileDb } from "./file-db";

const seedWithUser = (): Db => {
  const db = createEmptyDb();
  db.users.u_test = {
    id: "u_test",
    name: "Тест",
    avatarColor: AVATAR_COLORS[0],
    interests: [],
    audience: "all",
    isBot: false,
    createdAt: new Date(0).toISOString(),
  };
  return db;
};

let dir: string;
let file: string;
const silent = () => undefined;

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "swipeit-file-db-"));
  file = path.join(dir, "db.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("file-db", () => {
  it("создаёт базу из сида, если файла нет, и сохраняет её", async () => {
    const db = createFileDb({
      file,
      createInitial: async () => seedWithUser(),
      log: silent,
    });
    expect(await db.init()).toBe("created");
    const saved = parseDb(await readFile(file, "utf8"));
    expect(saved).not.toBe("broken");
    expect((saved as Db).users.u_test?.name).toBe("Тест");
  });

  it("читает существующий файл и не трогает сид", async () => {
    await writeFile(file, JSON.stringify(seedWithUser()));
    let seeded = false;
    const db = createFileDb({
      file,
      createInitial: async () => {
        seeded = true;
        return createEmptyDb();
      },
      log: silent,
    });
    expect(await db.init()).toBe("loaded");
    expect(seeded).toBe(false);
    expect((await db.read()).users.u_test).toBeDefined();
  });

  it("битый файл — пересоздаёт из сида и оставляет копию", async () => {
    await writeFile(file, "{ не json");
    const lines: string[] = [];
    const db = createFileDb({
      file,
      createInitial: async () => seedWithUser(),
      log: (line) => lines.push(line),
    });
    expect(await db.init()).toBe("broken");
    expect(lines.join("\n")).toContain("повреждена");
    expect((await db.read()).users.u_test).toBeDefined();
    const files = await readdir(dir);
    expect(files.some((name) => name.startsWith("db.json.broken-"))).toBe(true);
  });

  it("файл не по схеме — тоже битый", async () => {
    await writeFile(file, JSON.stringify({ version: 99 }));
    const db = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    expect(await db.init()).toBe("broken");
  });

  it("параллельные записи не теряют обновления", async () => {
    const db = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    // Счётчик — длина массива друзей: каждая запись читает и дописывает.
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        db.write((draft) => {
          const list = (draft.friends.counter ??= []);
          list.push(`f${index}`);
          return list.length;
        }),
      ),
    );
    expect((await db.read()).friends.counter).toHaveLength(20);
    const saved = parseDb(await readFile(file, "utf8")) as Db;
    expect(saved.friends.counter).toHaveLength(20);
    // Временных файлов не осталось.
    expect(
      (await readdir(dir)).filter((name) => name.endsWith(".tmp")),
    ).toEqual([]);
  });

  it("неудачная запись не меняет базу, следующие идут дальше", async () => {
    const db = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    await expect(
      db.write((draft) => {
        draft.friends.a = ["b"];
        throw new Error("бум");
      }),
    ).rejects.toThrow("бум");
    await expect(
      db.write((draft) => {
        // Не по схеме — assertValidDb не пропустит.
        (draft as { version: number }).version = 2;
      }),
    ).rejects.toThrow();
    await db.write((draft) => {
      draft.friends.c = ["d"];
    });
    const current = await db.read();
    expect(current.friends.a).toBeUndefined();
    expect(current.version).toBe(1);
    expect(current.friends.c).toEqual(["d"]);
  });

  it("read отдаёт копию: мутация мимо write не попадает в базу", async () => {
    const db = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    const copy = await db.read();
    copy.friends.x = ["y"];
    expect((await db.read()).friends.x).toBeUndefined();
  });

  it("replace заменяет базу целиком и на диске", async () => {
    const db = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    await db.write((draft) => {
      draft.friends.old = [];
    });
    await db.replace(seedWithUser());
    const current = await db.read();
    expect(current.friends.old).toBeUndefined();
    expect(current.users.u_test).toBeDefined();
    const reopened = createFileDb({
      file,
      createInitial: async () => createEmptyDb(),
      log: silent,
    });
    expect(await reopened.init()).toBe("loaded");
    expect((await reopened.read()).users.u_test).toBeDefined();
  });
});
