import { toDateKey } from "@swipeit/core/format";
import { count, desc, eq, isNull, sql } from "drizzle-orm";

import type { Database } from "../../db/client";
import { shareLinks, users } from "../../db/schema";
import { viaLabel } from "./report";

// Пометка своих профилей команды (Q03, auto-tasks-metrics-1 M08): их шаги
// воронка не считает. Логика команды funnel:team — здесь, чтобы её проверяли
// тесты; db/funnel-team-cli.ts только печатает и выходит с кодом. В выводе
// нет ни id, ни имён: только время создания, откуда пришёл и число шагов.

export const TEAM_HELP = `Пометить свой профиль команды: его шаги воронка не считает.

  npm run funnel:team -- <код ссылки>       пометить автора ссылки на вишлист
                                            или ссылки-фильтра
  npm run funnel:team -- --recent [10]      последние профили, без имён и id
  npm run funnel:team -- --pick <номер>     пометить профиль из --recent
  npm run funnel:team -- --list             сколько профилей помечено своими
  npm run funnel:team -- --user <id>        пометить по id (из базы)
  …и --undo — снять пометку.
  В образе: node dist/funnel-team.js …

Не помечай профиль, которым ведёшь живую игру или план: жеребьёвка и
«Решено» этой компании пропадут из счётчиков. Такой профиль команда не
пометит без --force.

Код приглашения в игру или план пометит организатора — команда откажется
без --invite-owner. Уже набранные счётчики остаются как есть.

Тестовый телефон: открой приложение (профиль создастся сам), потом
--recent и --pick 1 — это самый новый профиль.`;

export type TeamCommand =
  | { kind: "help" }
  | { kind: "list" }
  | { kind: "mark"; target: TeamTarget; flags: TeamFlags }
  | { kind: "recent"; limit: number };

type TeamTarget =
  | { code: string; kind: "code" }
  | { kind: "pick"; limit: number; position: number }
  | { id: string; kind: "user" };

type TeamFlags = { force: boolean; inviteOwner: boolean; undo: boolean };

const DEFAULT_RECENT = 10;
const MAX_RECENT = 50;

const FLAGS_WITH_VALUE = new Set(["--pick", "--recent", "--user"]);

export const parseTeamArgs = (
  args: readonly string[],
): { command: TeamCommand; ok: true } | { message: string; ok: false } => {
  const has = (flag: string) => args.includes(flag);
  const valueOf = (flag: string) => {
    const index = args.indexOf(flag);
    const value = index === -1 ? undefined : args[index + 1];
    return value === undefined || value.startsWith("--") ? undefined : value;
  };
  const known = new Set([
    ...FLAGS_WITH_VALUE,
    "--force",
    "--help",
    "--invite-owner",
    "--list",
    "--undo",
    "-h",
  ]);
  const unknown = args.find((arg) => arg.startsWith("-") && !known.has(arg));
  if (unknown) {
    return {
      ok: false,
      message: `Неизвестный флаг ${unknown}. Справка: --help`,
    };
  }
  if (has("--help") || has("-h"))
    return { ok: true, command: { kind: "help" } };
  if (has("--list")) return { ok: true, command: { kind: "list" } };

  const number = (flag: string, min: number, max: number) => {
    const raw = valueOf(flag);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    return Number.isInteger(value) && value >= min && value <= max
      ? value
      : null;
  };
  const limit = has("--recent")
    ? number("--recent", 1, MAX_RECENT)
    : DEFAULT_RECENT;
  if (limit === null) {
    return {
      ok: false,
      message: `--recent: целое число от 1 до ${MAX_RECENT}`,
    };
  }
  const flags: TeamFlags = {
    force: has("--force"),
    inviteOwner: has("--invite-owner"),
    undo: has("--undo"),
  };

  if (has("--pick")) {
    const position = number("--pick", 1, limit ?? DEFAULT_RECENT);
    if (position === undefined || position === null) {
      return {
        ok: false,
        message: `--pick: номер из списка --recent (от 1 до ${limit ?? DEFAULT_RECENT})`,
      };
    }
    return {
      ok: true,
      command: {
        kind: "mark",
        target: { kind: "pick", position, limit: limit ?? DEFAULT_RECENT },
        flags,
      },
    };
  }
  if (has("--recent")) {
    return {
      ok: true,
      command: { kind: "recent", limit: limit ?? DEFAULT_RECENT },
    };
  }
  if (has("--user")) {
    const id = valueOf("--user");
    if (!id) return { ok: false, message: "--user: нужен id профиля" };
    return {
      ok: true,
      command: { kind: "mark", target: { kind: "user", id }, flags },
    };
  }
  const code = args.find(
    (arg, index) =>
      !arg.startsWith("-") && !FLAGS_WITH_VALUE.has(args[index - 1] ?? ""),
  );
  if (!code) {
    return {
      ok: false,
      message: "Нужен код ссылки, --recent или --pick. Справка: --help",
    };
  }
  return {
    ok: true,
    command: { kind: "mark", target: { kind: "code", code }, flags },
  };
};

type ProfileRow = {
  createdAt: Date;
  createdVia: null | string;
  funnelInternal: boolean;
  funnelSteps: string[];
  id: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
// «28.11 14:05» — по поясу процесса (M11: по Бишкеку).
export const shortTime = (at: Date) =>
  `${pad(at.getDate())}.${pad(at.getMonth() + 1)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;

const recentProfiles = (db: Database, limit: number): Promise<ProfileRow[]> =>
  db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      createdVia: users.createdVia,
      funnelInternal: users.funnelInternal,
      funnelSteps: users.funnelSteps,
    })
    .from(users)
    .where(isNull(users.deletedAt))
    .orderBy(desc(users.createdAt), desc(users.id))
    .limit(limit);

// Живые игры и планы, которые профиль ведёт, а в них есть не свои люди.
// Игра живая, пока не прошёл обмен; план — пока не «Решено».
const liveLed = async (db: Database, userId: string, now: number) => {
  const today = toDateKey(now);
  const { rows } = await db.execute<{ games: number; plans: number }>(sql`
    select
      (select count(*)::int from santa_games g
        where g.owner_id = ${userId} and g.exchange_date >= ${today}
          and exists (
            select 1 from santa_members m join users u on u.id = m.user_id
            where m.game_id = g.id and m.user_id <> ${userId}
              and not u.funnel_internal
          )) as games,
      (select count(*)::int from plans p
        where p.owner_id = ${userId} and p.status <> 'decided'
          and exists (
            select 1 from plan_participants pp join users u on u.id = pp.user_id
            where pp.plan_id = p.id and pp.user_id <> ${userId}
              and not u.funnel_internal
          )) as plans
  `);
  return { games: rows[0]?.games ?? 0, plans: rows[0]?.plans ?? 0 };
};

const profileLine = (
  profile: ProfileRow,
  led: { games: number; plans: number },
) =>
  `создан ${shortTime(profile.createdAt)}, откуда: ${viaLabel(profile.createdVia)}, шагов засчитано: ${profile.funnelSteps.length}, ведёт живых игр: ${led.games}, планов: ${led.plans}`;

// Ссылки, по которым помечают себя: свой вишлист и своя ссылка-фильтр.
const OWN_LINK_KINDS = new Set(["wishlist", "pick_request"]);

const resolveTarget = async (
  db: Database,
  target: TeamTarget,
  flags: TeamFlags,
): Promise<{ id: string } | { message: string }> => {
  if (target.kind === "user") return { id: target.id };
  if (target.kind === "pick") {
    const list = await recentProfiles(db, target.limit);
    const picked = list[target.position - 1];
    return picked
      ? { id: picked.id }
      : { message: `В списке нет профиля № ${target.position}` };
  }
  const [link] = await db
    .select({ kind: shareLinks.kind, ownerId: shareLinks.ownerId })
    .from(shareLinks)
    .where(eq(shareLinks.code, target.code))
    .limit(1);
  if (!link) return { message: "Ссылка не найдена" };
  if (!OWN_LINK_KINDS.has(link.kind) && !flags.inviteOwner) {
    return {
      message:
        link.kind === "pick_answer"
          ? "Это ссылка с ответом друга — пометишь его, а не себя. Если так и надо: --invite-owner"
          : "Это приглашение в игру или план — пометишь организатора. Если так и надо: --invite-owner",
    };
  }
  return { id: link.ownerId };
};

export type TeamResult = { exitCode: 0 | 1; text: string };

export const runTeamCommand = async (
  db: Database,
  args: readonly string[],
  now: number,
): Promise<TeamResult> => {
  const parsed = parseTeamArgs(args);
  if (!parsed.ok) return { exitCode: 1, text: parsed.message };
  const { command } = parsed;

  if (command.kind === "help") return { exitCode: 0, text: TEAM_HELP };

  if (command.kind === "list") {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(eq(users.funnelInternal, true));
    return {
      exitCode: 0,
      text: `Своими помечено профилей: ${row?.n ?? 0}`,
    };
  }

  if (command.kind === "recent") {
    const list = await recentProfiles(db, command.limit);
    if (list.length === 0) return { exitCode: 0, text: "Профилей нет." };
    return {
      exitCode: 0,
      text: [
        "Последние профили (свежие сверху):",
        ...list.map(
          (profile, index) =>
            `  ${index + 1}. создан ${shortTime(profile.createdAt)}, откуда: ${viaLabel(profile.createdVia)}, шагов: ${profile.funnelSteps.length}, свой: ${profile.funnelInternal ? "да" : "нет"}`,
        ),
        "Пометить своим: --pick <номер>.",
      ].join("\n"),
    };
  }

  const { target, flags } = command;
  const resolved = await resolveTarget(db, target, flags);
  if ("message" in resolved) return { exitCode: 1, text: resolved.message };
  const [profile] = await db
    .select({
      id: users.id,
      createdAt: users.createdAt,
      createdVia: users.createdVia,
      funnelInternal: users.funnelInternal,
      funnelSteps: users.funnelSteps,
    })
    .from(users)
    .where(eq(users.id, resolved.id))
    .limit(1);
  if (!profile) return { exitCode: 1, text: "Профиль не найден" };
  const led = await liveLed(db, profile.id, now);

  if (!flags.undo && profile.funnelInternal) {
    return {
      exitCode: 0,
      text: `Уже помечен своим: ${profileLine(profile, led)}`,
    };
  }
  if (!flags.undo && led.games + led.plans > 0 && !flags.force) {
    return {
      exitCode: 1,
      text: [
        `Не помечаю: ${profileLine(profile, led)}.`,
        "Этот профиль ведёт игру или план, где есть не свои люди: их жеребьёвка и «Решено» пропадут из счётчиков. Если так и надо: --force",
      ].join("\n"),
    };
  }
  await db
    .update(users)
    .set({ funnelInternal: !flags.undo })
    .where(eq(users.id, profile.id));
  return {
    exitCode: 0,
    text: [
      flags.undo
        ? "Пометка снята: шаги профиля снова считаются."
        : "Профиль помечен своим: дальше его шаги не считаются. Уже набранные счётчики остаются как есть.",
      profileLine(profile, led),
    ].join("\n"),
  };
};
