import type { SantaView } from "@/entities/santa-game";

// Крестик «Убрать из игры» в строке участника — у организатора и до, и после
// жеребьёвки (Q05, auto-tasks-pm-3 R05): после неё пары чинит сервер, Санта
// убранного получает новое письмо. Себя организатор не убирает.
export const canRemoveMember = (
  view: Pick<SantaView, "game">,
  meId: string,
  memberId: string,
) => view.game.ownerId === meId && memberId !== view.game.ownerId;

// Подтверждение «Убрать». После жеребьёвки (R05) — что станет с парами и что
// их по-прежнему никто не увидит. Имя в именительном: пола у участника нет,
// а «Убрать Азамата» / «Убрать Айгерим» без него не угадать (core genitive).
export const removeMemberCopy = ({
  name,
  gameTitle,
  drawn,
}: {
  drawn: boolean;
  gameTitle: string;
  name: string;
}): { description: string; title: string } =>
  drawn
    ? {
        title: "Убрать после жеребьёвки?",
        description: `${name} выйдет из игры. Подопечного возьмёт другой Санта и получит новое письмо. Кто кому дарит, по-прежнему не увидит никто`,
      }
    : {
        title: "Убрать из игры?",
        description: `${name} не будет участвовать в «${gameTitle}» и не сможет вступить снова`,
      };

// Что внизу экрана у участника (не организатора). До жеребьёвки — «Выйти из
// игры» (Q05). После — выйти самому нельзя: подопечный остался бы без
// подарка, а чинить пары может только организатор (R05), — поэтому подпись
// «напиши организатору». Жеребьёвка прошла без меня — ничего: строка «прошла
// без тебя» уже выше.
export type LeaveAction = "ask-owner" | "leave" | null;

export const leaveAction = (
  view: Pick<SantaView, "game" | "me" | "role">,
): LeaveAction => {
  if (view.role === "owner" || view.role === "guest") return null;
  if (view.game.status === "gathering") return "leave";
  return view.me ? "ask-owner" : null;
};

export const ASK_OWNER_TO_REMOVE =
  "Не сможешь участвовать — напиши организатору, он уберёт тебя из игры, и твой подопечный не останется без подарка";
