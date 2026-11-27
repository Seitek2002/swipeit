import type { PlanSession } from "./types";

// Совпадения плана (TECH_SPEC §6, «computeMatches»). Чистая функция: её
// зовут и мок-сервер (события plan:match), и экраны (счётчик совпадений,
// результаты в T15) — поэтому живёт в shared, а entities/plan её
// реэкспортирует.

export type PlanMatch = { activityId: string; likes: number };

export type PlanMatches = {
  // Только при правиле «all»: набрали большинство, но не всех.
  almost: PlanMatch[];
  // Лайки каждого занятия колоды (0 — никто не лайкнул) — для экранов.
  likesById: Record<string, number>;
  // Прошли правило сессии.
  matches: PlanMatch[];
};

type MatchInput = Pick<
  PlanSession,
  "deck" | "matchRule" | "participantIds" | "swipes"
>;

const isMajority = (likes: number, participants: number) =>
  likes > participants / 2;

// activities — занятия колоды, которые реально есть (занятие могло пропасть
// из каталога после обновления): без него считается вся колода.
export const computeMatches = (
  plan: MatchInput,
  activities?: ReadonlyArray<{ id: string }>,
): PlanMatches => {
  const available = activities
    ? new Set(activities.map((activity) => activity.id))
    : null;
  const deck = [...new Set(plan.deck)].filter(
    (id) => !available || available.has(id),
  );
  const participants = [...new Set(plan.participantIds)];
  const total = participants.length;

  const likesById: Record<string, number> = {};
  for (const id of deck) likesById[id] = 0;
  // Считаем только нынешних участников: чужие записи в swipes не в счёт.
  for (const userId of participants) {
    const mine = plan.swipes[userId] ?? {};
    for (const id of deck) {
      if (mine[id] === "like") likesById[id] = (likesById[id] ?? 0) + 1;
    }
  }

  const matches: PlanMatch[] = [];
  const almost: PlanMatch[] = [];
  for (const activityId of deck) {
    const likes = likesById[activityId] ?? 0;
    // Без лайков совпадения нет, даже если участников ноль.
    if (likes === 0) continue;
    const entry = { activityId, likes };
    if (plan.matchRule === "all") {
      if (likes === total) matches.push(entry);
      else if (isMajority(likes, total)) almost.push(entry);
    } else if (isMajority(likes, total)) {
      matches.push(entry);
    }
  }

  // sort стабильный: при равных лайках остаётся порядок колоды.
  const byLikes = (a: PlanMatch, b: PlanMatch) => b.likes - a.likes;
  return {
    matches: matches.sort(byLikes),
    almost: almost.sort(byLikes),
    likesById,
  };
};

// ── Результаты и решение (T15) ──────────────────────────────────────

export type DecisionCandidates = {
  // Среди чего крутится барабан. Пусто — экран «Совпадений нет».
  pool: string[];
  source: "almost" | "matches" | "none";
};

// Барабан крутится среди совпадений, нет их — среди «почти» (TECH_SPEC §6,
// «computeMatches»). Одна функция на сервер (POST /decide) и экран
// результатов: иначе барабан показал бы не тот пул, из которого выбрал
// сервер.
export const decisionCandidates = (
  plan: MatchInput,
  activities?: ReadonlyArray<{ id: string }>,
): DecisionCandidates => {
  const { matches, almost } = computeMatches(plan, activities);
  if (matches.length > 0) {
    return { pool: matches.map((m) => m.activityId), source: "matches" };
  }
  if (almost.length > 0) {
    return { pool: almost.map((m) => m.activityId), source: "almost" };
  }
  return { pool: [], source: "none" };
};

// За что можно голосовать в «Выбрать самим»: пул барабана, а если он
// пуст — вся колода (без совпадений выбирать всё равно из чего-то надо).
export const voteCandidates = (
  plan: MatchInput,
  activities?: ReadonlyArray<{ id: string }>,
): string[] => {
  const { pool } = decisionCandidates(plan, activities);
  if (pool.length > 0) return pool;
  const available = activities
    ? new Set(activities.map((activity) => activity.id))
    : null;
  return [...new Set(plan.deck)].filter(
    (id) => !available || available.has(id),
  );
};

export type VoteTally = {
  // Голоса по занятиям (только кандидаты, только нынешние участники).
  counts: Record<string, number>;
  // Занятия с наибольшим числом голосов; при ничьей — несколько, в порядке
  // кандидатов. Пусто — никто не голосовал.
  leaders: string[];
};

// Подсчёт голосов: «Утвердить» у организатора подтверждает одного из
// лидеров — так считают и сервер, и экран.
export const tallyVotes = (
  plan: MatchInput & Pick<PlanSession, "votes">,
  activities?: ReadonlyArray<{ id: string }>,
): VoteTally => {
  const candidates = voteCandidates(plan, activities);
  const allowed = new Set(candidates);
  const counts: Record<string, number> = {};
  for (const userId of new Set(plan.participantIds)) {
    const vote = plan.votes[userId];
    if (vote !== undefined && allowed.has(vote)) {
      counts[vote] = (counts[vote] ?? 0) + 1;
    }
  }
  const best = Math.max(0, ...Object.values(counts));
  const leaders =
    best === 0 ? [] : candidates.filter((id) => counts[id] === best);
  return { counts, leaders };
};
