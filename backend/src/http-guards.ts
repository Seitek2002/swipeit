import type { FastifyInstance } from "fastify";

// CORS, защитные заголовки и сборка клиента в логах (BACKEND.md §10, §12,
// B17). Своими руками, а не @fastify/cors и helmet: API отдаёт только JSON
// и картинки, правил немного.
export const registerHttpGuards = (
  app: FastifyInstance,
  { corsOrigins }: { corsOrigins: readonly string[] },
) => {
  const allowed = new Set(corsOrigins);
  app.addHook("onRequest", async (request, reply) => {
    // Сборка фронта — в каждой строке лога этого запроса (§12).
    const build = request.headers["x-client-build"];
    if (typeof build === "string" && build.length <= 40) {
      request.log = request.log.child({ clientBuild: build });
    }
    // CORS — только адресам из CORS_ORIGINS, точным списком. Cookie нет,
    // поэтому без credentials.
    const origin = request.headers.origin;
    if (origin && allowed.has(origin)) {
      reply.header("access-control-allow-origin", origin);
      reply.header("vary", "Origin");
      if (request.method === "OPTIONS") {
        reply
          .header(
            "access-control-allow-methods",
            "GET, POST, PATCH, DELETE, OPTIONS",
          )
          .header(
            "access-control-allow-headers",
            "authorization, content-type, x-client-build, x-swipeit-refetch",
          )
          .header("access-control-max-age", "600");
        return reply.status(204).send();
      }
    }
    return undefined;
  });
  // Заголовки как у helmet — для API их хватает.
  app.addHook("onSend", async (_request, reply, payload) => {
    reply
      .header("x-content-type-options", "nosniff")
      .header("referrer-policy", "no-referrer")
      .header("x-frame-options", "DENY")
      .header("cross-origin-resource-policy", "cross-origin")
      .header(
        "content-security-policy",
        "default-src 'none'; img-src 'self'; frame-ancestors 'none'",
      );
    return payload;
  });
};
