// «Создать игру с демо-друзьями» (auto-tasks-ux-6 Z05): форма открывается
// заполненной — название и три отмеченных демо-друга (боты: они вступят и
// соберут вишлист сами). Ботов меньше — сколько есть.
export const DEMO_GAME_TITLE = "Демо-игра";

const DEMO_FRIENDS = 3;

export const demoFriendIds = (
  friends: ReadonlyArray<{ user: { id: string; isBot: boolean } }>,
): string[] =>
  friends
    .filter(({ user }) => user.isBot)
    .slice(0, DEMO_FRIENDS)
    .map(({ user }) => user.id);
