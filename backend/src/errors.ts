import { isApiError } from "@swipeit/core/errors";
import type { FastifyError, FastifyInstance } from "fastify";

// Ошибки по BACKEND.md §4.5: JSON { code, message, requestId } с HTTP-статусом,
// message — по-русски, для экрана. Неизвестная ошибка — INTERNAL без
// подробностей наружу, подробности — в логе по requestId.
export const registerErrors = (app: FastifyInstance) => {
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId = request.id;
    if (isApiError(error)) {
      return reply
        .status(error.status)
        .send({ code: error.code, message: error.message, requestId });
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return reply.status(413).send({
        code: "VALIDATION",
        message: "Слишком большой запрос",
        requestId,
      });
    }
    // Битый JSON, неверный Content-Type и прочие ошибки разбора запроса.
    if (error.statusCode !== undefined && error.statusCode < 500) {
      return reply.status(400).send({
        code: "VALIDATION",
        message: "Неверные данные",
        requestId,
      });
    }
    request.log.error({ err: error }, "Необработанная ошибка");
    return reply.status(500).send({
      code: "INTERNAL",
      message: "Что-то пошло не так. Попробуй ещё раз",
      requestId,
    });
  });

  app.setNotFoundHandler((request, reply) =>
    reply.status(404).send({
      code: "NOT_FOUND",
      message: "Нет такого адреса",
      requestId: request.id,
    }),
  );
};
