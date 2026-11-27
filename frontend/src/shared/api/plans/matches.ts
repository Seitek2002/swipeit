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
