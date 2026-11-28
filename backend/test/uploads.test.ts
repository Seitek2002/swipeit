import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createSeededRandom } from "@swipeit/core/logic/random";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { testConfig } from "./config";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Фото (BACKEND.md B13): перекодирование без EXIF, только картинки, в своём
// желании — только свой ключ.
const database = createTestDb();
afterAll(() => database.close());

let app: ReturnType<typeof buildApp>;
let dir = "";
beforeEach(async () => {
  await resetDb(database);
  dir = await mkdtemp(path.join(tmpdir(), "swipeit-uploads-"));
  app = buildApp({
    config: testConfig({ UPLOADS_DIR: dir }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("uploads"),
  });
});
afterEach(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

type Person = { id: string; token: string };

const person = async (): Promise<Person> => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  return { id: me.id, token };
};

const upload = (who: Person, body: Buffer | string, type = "image/jpeg") =>
  app.inject({
    method: "POST",
    url: "/v1/uploads",
    headers: { authorization: `Bearer ${who.token}`, "content-type": type },
    payload: body,
  });

// JPEG 1600×1200 с EXIF: подпись и «геометка» в описании.
const photoWithExif = () =>
  sharp({
    create: {
      width: 1600,
      height: 1200,
      channels: 3,
      background: { r: 200, g: 120, b: 60 },
    },
  })
    .jpeg()
    .withExif({
      IFD0: { ImageDescription: "GPS 42.87,74.59", Artist: "Секрет" },
    })
    .toBuffer();

describe("фото (B13)", () => {
  it("после загрузки — без EXIF, не больше 720 px; отдаётся по ключу с immutable", async () => {
    const original = await photoWithExif();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const me = await person();
    const response = await upload(me, original);
    expect(response.statusCode).toBe(200);
    const { key, url } = response.json() as { key: string; url: string };
    expect(url).toBe(`/v1/uploads/${key}`);
    const served = await app.inject({ method: "GET", url });
    expect(served.statusCode).toBe(200);
    expect(served.headers["cache-control"]).toContain("immutable");
    const meta = await sharp(served.rawPayload).metadata();
    expect(meta.exif).toBeUndefined();
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBe(720);
    expect(served.rawPayload.includes(Buffer.from("42.87"))).toBe(false);
  });

  it("не картинка — VALIDATION; без токена — 401; неизвестный ключ — 404", async () => {
    const me = await person();
    const bad = await upload(me, "точно не картинка", "image/png");
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toMatchObject({ code: "VALIDATION" });
    const anonymous = await app.inject({
      method: "POST",
      url: "/v1/uploads",
      headers: { "content-type": "image/jpeg" },
      payload: await photoWithExif(),
    });
    expect(anonymous.statusCode).toBe(401);
    expect(
      (await app.inject({ method: "GET", url: "/v1/uploads/..%2Fsecret" }))
        .statusCode,
    ).toBe(404);
  });

  it("чужой imageKey в своём желании — VALIDATION; свой — можно", async () => {
    const me = await person();
    const other = await person();
    const theirs = (await upload(other, await photoWithExif())).json() as {
      key: string;
    };
    const mine = (await upload(me, await photoWithExif())).json() as {
      key: string;
    };
    const wish = (imageKey: string) =>
      app.inject({
        method: "POST",
        url: "/v1/wishlist/items",
        headers: { authorization: `Bearer ${me.token}` },
        payload: { title: "Плед", imageKey },
      });
    expect((await wish(theirs.key)).statusCode).toBe(400);
    expect((await wish(mine.key)).statusCode).toBe(200);
  });
});
