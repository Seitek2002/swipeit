import { notFound, unauthorized } from "@swipeit/core/errors";
import type { Random } from "@swipeit/core/logic/random";
import type { FastifyInstance } from "fastify";

import { resolveSession } from "./auth/sessions";
import type { ServerCatalog } from "./catalog/load";
import type { Clock, ServerContext } from "./context";
import type { Db } from "./db/client";
import {
  UPLOAD_LIMIT_BYTES,
  createUpload,
  sniffImage,
} from "./domains/uploads/handlers";
import type { PhotoStorage } from "./domains/uploads/storage";

// Фото (BACKEND.md B13): POST /v1/uploads — картинка в теле (не JSON), GET
// /v1/uploads/:key — сама картинка. Поэтому отдельно от маршрутов контракта.
export const registerUploads = (
  app: FastifyInstance,
  deps: {
    catalog: ServerCatalog;
    clock: Clock;
    db: Db;
    random: Random;
    storage: PhotoStorage;
  },
) => {
  // Тело image/* — как есть, до 2 МБ (§10; клиент и так сжимает до 720 px).
  app.addContentTypeParser(
    /^image\//,
    { parseAs: "buffer", bodyLimit: UPLOAD_LIMIT_BYTES },
    (_request, body, done) => done(null, body),
  );

  app.post("/v1/uploads", async (request) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ")
      ? header.slice("Bearer ".length).trim()
      : "";
    const session = token
      ? await resolveSession(deps.db.db, token, deps.clock)
      : null;
    if (!session) throw unauthorized();
    return deps.db.db.transaction((tx) => {
      const ctx: ServerContext = {
        tx,
        userId: session.userId,
        sessionId: session.sessionId,
        userAgent: request.headers["user-agent"] ?? null,
        isRefetch: false,
        clock: deps.clock,
        random: deps.random,
        catalog: deps.catalog,
        // Своё фото — событий нет: оно попадёт в желание или занятие.
        events: { publish: () => undefined },
        log: request.log,
        publicShareUrl: "",
      };
      return createUpload(ctx, request.body, deps.storage);
    });
  });

  app.get<{ Params: { key: string } }>(
    "/v1/uploads/:key",
    async (request, reply) => {
      const data = await deps.storage.get(request.params.key);
      if (!data) throw notFound("Фото не найдено");
      return (
        reply
          .header("content-type", sniffImage(data) ?? "image/jpeg")
          // Ключ новый на каждое фото — содержимое по нему не меняется.
          .header("cache-control", "public, max-age=31536000, immutable")
          .send(data)
      );
    },
  );
};
