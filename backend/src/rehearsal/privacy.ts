// Проверка приватности пар репетиции (auto-tasks-pm-4 S06, шаг 7): чистая
// функция над тем, что человек получил от сервера, — ответы HTTP и события
// сокета. id участников и так видны всем в members, поэтому ищем не id, а
// связь «Санта → подопечный»:
//   - поле assignments — где угодно;
//   - ward (объект с id), wardId — только свой подопечный;
//   - santaId — никогда: своего Санту не знает никто;
//   - событие о бронях вишлиста (db:changed + reservations) про чужого
//     человека — его шлют только Санте и подопечному, третьему оно выдало бы,
//     кто кому дарит;
//   - тост для другого человека (forUserId не мой).

export type PairLeak = { path: string; reason: string };

export type ViewerData = {
  // Сокет: сообщения как пришли (JSON).
  events: readonly unknown[];
  // Свои подопечные за всю игру: после «Убрать» у Санты может появиться
  // новый.
  ownWardIds: ReadonlySet<string>;
  // Ответы HTTP (JSON), с маршрутом — для понятного отчёта.
  responses: ReadonlyArray<{ body: unknown; route: string }>;
  viewerId: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const walk = (
  value: unknown,
  path: string,
  visit: (node: Record<string, unknown>, path: string) => void,
) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, `${path}[${index}]`, visit));
    return;
  }
  if (!isObject(value)) return;
  visit(value, path);
  for (const [key, child] of Object.entries(value)) {
    walk(child, `${path}.${key}`, visit);
  }
};

const checkNode =
  (data: ViewerData, leaks: PairLeak[]) =>
  (node: Record<string, unknown>, path: string) => {
    if ("assignments" in node && node.assignments !== undefined) {
      leaks.push({ path: `${path}.assignments`, reason: "пары целиком" });
    }
    if ("santaId" in node && node.santaId !== undefined) {
      leaks.push({ path: `${path}.santaId`, reason: "чей-то Санта" });
    }
    const ward = node.ward;
    if (isObject(ward) && typeof ward.id === "string") {
      if (!data.ownWardIds.has(ward.id)) {
        leaks.push({ path: `${path}.ward`, reason: "чужой подопечный" });
      }
    }
    if (typeof node.wardId === "string" && !data.ownWardIds.has(node.wardId)) {
      leaks.push({ path: `${path}.wardId`, reason: "чужой подопечный" });
    }
  };

export const findPairLeaks = (data: ViewerData): PairLeak[] => {
  const leaks: PairLeak[] = [];
  const visit = checkNode(data, leaks);
  for (const { body, route } of data.responses) walk(body, route, visit);
  data.events.forEach((event, index) => {
    const path = `ws[${index}]`;
    walk(event, path, visit);
    if (!isObject(event)) return;
    if (
      event.type === "toast" &&
      typeof event.forUserId === "string" &&
      event.forUserId !== data.viewerId
    ) {
      leaks.push({ path, reason: "тост другому человеку" });
    }
    if (
      event.type === "db:changed" &&
      Array.isArray(event.scope) &&
      event.scope.includes("reservations") &&
      typeof event.id === "string" &&
      event.id.startsWith("u_") &&
      event.id !== data.viewerId &&
      !data.ownWardIds.has(event.id)
    ) {
      leaks.push({ path, reason: "брони чужого подопечного" });
    }
  });
  return leaks;
};
