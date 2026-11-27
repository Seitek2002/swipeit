import { ApiError } from "../mock-server/errors";

// Жеребьёвка Тайного Санты (TECH_SPEC §6 «drawAssignments»): каждому —
// ровно один подопечный, никто не дарит себе, пары из исключений не дарят
// друг другу ни в одну сторону. Чистая функция: случайность приходит
// снаружи (в бою — ctx.random на crypto.getRandomValues, в тестах — сид).

export const MIN_SANTA_PARTICIPANTS = 3;

type RandomSource = { next(): number };

// Как назвать участника в тексте ошибки — в дательном падеже: «Азамату
// некому дарить». По умолчанию — сам id (тесты, отладка).
type Describe = (id: string) => string;

const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

// Фишер–Йетс.
const shuffle = <T>(list: readonly T[], random: RandomSource): T[] => {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random.next() * (i + 1));
    [result[i], result[j]] = [result[j] as T, result[i] as T];
  }
  return result;
};

const pairKey = (a: string, b: string) => (a < b ? `${a}\n${b}` : `${b}\n${a}`);

// Кому каждый может дарить: все, кроме себя и пар из исключений.
const candidatesOf = (ids: string[], exclusions: Array<[string, string]>) => {
  const banned = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  return new Map(
    ids.map((giver) => [
      giver,
      ids.filter((ward) => ward !== giver && !banned.has(pairKey(giver, ward))),
    ]),
  );
};

// Поиск с возвратом — паросочетание Куна: дарителю ищем подопечного, а если
// тот занят — пробуем передать занявшему другого. Перемешанный порядок
// дарителей и кандидатов даёт случайный итог, а сам поиск полный: если
// решение есть, он его найдёт, и для 30 человек это мгновенно (O(V·E)).
const match = (
  givers: string[],
  candidates: Map<string, string[]>,
): { santaOf: Map<string, string>; unmatched: string[] } => {
  // wardId → santaId.
  const santaOf = new Map<string, string>();
  const tryAssign = (giver: string, visited: Set<string>): boolean => {
    for (const ward of candidates.get(giver) ?? []) {
      if (visited.has(ward)) continue;
      visited.add(ward);
      const current = santaOf.get(ward);
      if (current === undefined || tryAssign(current, visited)) {
        santaOf.set(ward, giver);
        return true;
      }
    }
    return false;
  };
  const unmatched = givers.filter((giver) => !tryAssign(giver, new Set()));
  return { santaOf, unmatched };
};

// Пары santaId → wardId. Ошибка CONFLICT — меньше 3 участников или
// исключения не дают составить пары: текст сразу для экрана.
export const drawAssignments = (
  participantIds: readonly string[],
  exclusions: ReadonlyArray<readonly [string, string]>,
  random: RandomSource,
  describe: Describe = (id) => id,
): Record<string, string> => {
  const ids = [...new Set(participantIds)];
  if (ids.length < MIN_SANTA_PARTICIPANTS) {
    throw conflict(
      `Нужно хотя бы ${MIN_SANTA_PARTICIPANTS} участника — позови ещё друзей`,
    );
  }
  const members = new Set(ids);
  // Исключения с теми, кого в игре нет, ни на что не влияют.
  const relevant = exclusions
    .filter(([a, b]) => a !== b && members.has(a) && members.has(b))
    .map(([a, b]): [string, string] => [a, b]);
  const candidates = candidatesOf(ids, relevant);
  // Сначала — самый очевидный случай: у кого-то вообще нет вариантов.
  const stuck = ids.find((id) => (candidates.get(id) ?? []).length === 0);
  if (stuck !== undefined) {
    throw conflict(
      `Слишком много исключений: ${describe(stuck)} некому дарить`,
    );
  }
  const givers = shuffle(ids, random);
  const shuffled = new Map(
    givers.map((id) => [id, shuffle(candidates.get(id) ?? [], random)]),
  );
  const { santaOf, unmatched } = match(givers, shuffled);
  const left = unmatched[0];
  if (left !== undefined) {
    // Варианты у каждого есть, но на всех их не хватает (несколько человек
    // могут дарить только одному и тому же) — называем того, кому не досталось.
    throw conflict(`Слишком много исключений: ${describe(left)} некому дарить`);
  }
  const assignments: Record<string, string> = {};
  for (const [ward, santa] of santaOf) assignments[santa] = ward;
  return assignments;
};

// Можно ли провести жеребьёвку: null — да, иначе текст причины. Результат
// не зависит от случайности — поиск полный.
export const drawIssueOf = (
  participantIds: readonly string[],
  exclusions: ReadonlyArray<readonly [string, string]>,
  describe?: Describe,
): null | string => {
  try {
    drawAssignments(participantIds, exclusions, { next: () => 0 }, describe);
    return null;
  } catch (error) {
    if (error instanceof ApiError) return error.message;
    throw error;
  }
};
