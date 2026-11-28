import type { SantaSummary } from "@/shared/api";

// Пора тянуть пары (UX-аудит X10): я организатор, жеребьёвка «вручную, когда
// все соберутся», все в сборе, и её ещё не было. По дате её проведёт
// планировщик — организатора не зовём.
export const drawIsDue = (
  summary: Pick<SantaSummary, "drawIssue" | "game" | "role">,
): boolean =>
  summary.role === "owner" &&
  summary.game.status === "gathering" &&
  !summary.game.drawAt &&
  summary.drawIssue === null;

// Зачем точка на табе «Санта»: письмо ждёт вскрытия (reference.html) или
// организатору пора провести жеребьёвку. Причин может быть две сразу — в
// разных играх, диктор читает обе.
export const santaTabDot = (
  games: readonly SantaSummary[],
): { drawDue: boolean; envelopeReady: boolean } => ({
  envelopeReady: games.some((summary) => summary.me?.envelope === "ready"),
  drawDue: games.some(drawIsDue),
});
