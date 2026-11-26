import type { ServerDeps } from "./context";
import { notFound } from "./errors";
import { type HttpMethod, matchRoute } from "./routes";

export type MockRequest = {
  body?: unknown;
  method: HttpMethod;
  path: string;
  query?: Record<string, unknown>;
  userId: null | string;
};

export type MockServer = {
  deps: ServerDeps;
  handle(request: MockRequest): Promise<unknown>;
};

// «Сервер» мока: находит обработчик по таблице маршрутов и вызывает его с
// контекстом. Ничего не знает о том, где он запущен — в браузере или в Node.
export const createMockServer = (deps: ServerDeps): MockServer => ({
  deps,
  async handle({ method, path, body, query, userId }) {
    const match = matchRoute(method, path);
    if (!match) throw notFound(`Нет такого запроса: ${method} ${path}`);
    return match.handler(
      { ...deps, userId },
      { params: match.params, query: query ?? {}, body },
    );
  },
});
