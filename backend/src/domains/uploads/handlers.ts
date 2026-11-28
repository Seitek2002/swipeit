import { ApiError, validation } from "@swipeit/core/errors";
import { and, count, eq, gt } from "drizzle-orm";
import { nanoid } from "nanoid";
import sharp from "sharp";

import type { ServerContext } from "../../context";
import { uploads } from "../../db/schema";
import { readMe } from "../users/queries";
import type { PhotoStorage } from "./storage";

// Фото своих желаний и занятий (BACKEND.md B13, §10).

// Тип — по первым байтам, а не по заголовку телефона (как sniffImage в LAN).
export const sniffImage = (data: Buffer): null | string => {
  if (data.length < 12) return null;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) {
    return "image/png";
  }
  if (data.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (data.toString("ascii", 4, 12) === "ftypavif") return "image/avif";
  return null;
};

export const UPLOAD_LIMIT_BYTES = 2 * 1024 * 1024;
const PER_HOUR = 30;
const TOTAL = 200;
const SIDE = 720;
const HOUR_MS = 3600_000;

// POST /uploads — картинка в теле. Перекодирование заново (до 720 px по
// большей стороне) убирает EXIF с геометкой. Лимиты — 30 в час и 200 всего
// на человека.
export const createUpload = async (
  ctx: ServerContext,
  body: unknown,
  storage: PhotoStorage,
) => {
  const me = await readMe(ctx);
  if (!Buffer.isBuffer(body) || !sniffImage(body)) {
    throw validation("Это не похоже на фото");
  }
  const since = new Date(ctx.clock.now() - HOUR_MS);
  const [{ total = 0 } = {}] = await ctx.tx
    .select({ total: count() })
    .from(uploads)
    .where(eq(uploads.ownerId, me.id));
  const [{ recent = 0 } = {}] = await ctx.tx
    .select({ recent: count() })
    .from(uploads)
    .where(and(eq(uploads.ownerId, me.id), gt(uploads.createdAt, since)));
  if (recent >= PER_HOUR || total >= TOTAL) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "Слишком много фото — попробуй позже",
    );
  }
  let data: Buffer;
  try {
    data = await sharp(body)
      .rotate()
      .resize({
        width: SIDE,
        height: SIDE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  } catch {
    throw validation("Это не похоже на фото");
  }
  const key = nanoid(21);
  await storage.put(key, data);
  await ctx.tx.insert(uploads).values({
    key,
    ownerId: me.id,
    mime: "image/jpeg",
    bytes: data.length,
    createdAt: new Date(ctx.clock.now()),
  });
  return { key, url: `/v1/uploads/${key}` };
};
