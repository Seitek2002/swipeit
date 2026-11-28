import { toDateKey } from "@swipeit/core/format";
import { and, count, eq, gte, sql } from "drizzle-orm";

import type { Database } from "../../db/client";
import { funnelDaily, users } from "../../db/schema";
import { FUNNEL_STEPS, type FunnelStep } from "./steps";

// Подписи шагов для владельца (auto-tasks-metrics-1 M07): по-русски и с
// единицей счёта. «чел.» — первый раз у человека; планы, игры, сообщения и
// «раз» — каждый раз у плана, игры или события.
export type StepUnit = "игр" | "планов" | "раз" | "сообщ." | "чел.";

export const STEP_LABELS: Record<
  FunnelStep,
  { label: string; unit: StepUnit }
> = {
  profile_created: { label: "новые профили", unit: "чел." },
  first_swipe: { label: "первый свайп", unit: "чел." },
  share_unlocked: { label: "собрали 5 «Хочу»", unit: "чел." },
  wishlist_shared: { label: "отправили вишлист", unit: "чел." },
  share_channel_system: { label: "через «Поделиться»", unit: "чел." },
  share_channel_copy: { label: "скопировали ссылку", unit: "чел." },
  share_channel_qr: { label: "показали QR-код", unit: "чел." },
  share_reached: { label: "ссылку открыл другой", unit: "чел." },
  reservation_received: { label: "у них забронировали", unit: "чел." },
  gift_given_reserved: { label: "подарили по брони", unit: "чел." },
  guest_opened: { label: "открыли чужой вишлист", unit: "чел." },
  reservation_created: { label: "забронировали подарок", unit: "чел." },
  guest_first_swipe: { label: "гость свайпает себе", unit: "чел." },
  guest_shared: { label: "гость отправил свой", unit: "чел." },
  pick_created: { label: "создали подборку", unit: "чел." },
  pick_opened: { label: "друг открыл подборку", unit: "чел." },
  pick_answered: { label: "друг ответил", unit: "чел." },
  plan_created: { label: "создали план", unit: "чел." },
  plan_joined: { label: "вступили в план", unit: "чел." },
  plan_decided: { label: "нажали «Решено»", unit: "чел." },
  plan_started_group: { label: "планов начато", unit: "планов" },
  plan_decided_group: {
    label: "планов на 3+ дошли до «Решено»",
    unit: "планов",
  },
  santa_created: { label: "создали игру", unit: "чел." },
  santa_joined: { label: "вступили в игру", unit: "чел." },
  santa_member_wishlist: { label: "собрали 3+ желания", unit: "чел." },
  envelope_opened: { label: "открыли письмо", unit: "чел." },
  ward_empty: { label: "у подопечного пусто", unit: "чел." },
  santa_bought: { label: "отметили «Купил»", unit: "чел." },
  santa_drawn_group: { label: "разыграно игр", unit: "игр" },
  santa_drawn_with_namesakes: {
    label: "разыграно игр с тёзками",
    unit: "игр",
  },
  santa_draw_failed: { label: "жеребьёвка по дате не прошла", unit: "раз" },
  santa_removed_after_draw: {
    label: "убрали участника после жеребьёвки",
    unit: "раз",
  },
  notification_sent: { label: "бот отправил сообщений", unit: "сообщ." },
  first_swipe_feed: { label: "первый свайп из ленты", unit: "чел." },
  first_swipe_10s: { label: "из них за 10 секунд", unit: "чел." },
  swipes_20: { label: "прошли 20 карточек", unit: "чел." },
  share_with_birthday: { label: "отправили с днём рождения", unit: "чел." },
  in_app_browser_seen: { label: "во встроенном браузере", unit: "чел." },
  pwa_standalone: { label: "как приложение с экрана", unit: "чел." },
  session_expired_seen: { label: "видели «Сессия закончилась»", unit: "чел." },
  offline_seen: { label: "видели «Нет сети»", unit: "чел." },
  rate_limited_seen: { label: "видели «Слишком часто»", unit: "чел." },
};

// Разделы отчёта (M07). Каждый шаг — ровно в одном разделе (тест).
export const FUNNEL_SECTIONS: ReadonlyArray<{
  steps: readonly FunnelStep[];
  title: string;
}> = [
  {
    title: "Вишлист",
    steps: [
      "profile_created",
      "first_swipe",
      "share_unlocked",
      "wishlist_shared",
      "share_channel_system",
      "share_channel_copy",
      "share_channel_qr",
      "share_reached",
      "reservation_received",
      "gift_given_reserved",
    ],
  },
  {
    title: "Гость и петля",
    steps: [
      "guest_opened",
      "reservation_created",
      "guest_first_swipe",
      "guest_shared",
    ],
  },
  {
    title: "«Выбери подарок сам»",
    steps: ["pick_created", "pick_opened", "pick_answered"],
  },
  {
    title: "Планы",
    steps: [
      "plan_created",
      "plan_joined",
      "plan_decided",
      "plan_started_group",
      "plan_decided_group",
    ],
  },
  {
    title: "Санта",
    steps: [
      "santa_created",
      "santa_joined",
      "santa_member_wishlist",
      "envelope_opened",
      "ward_empty",
      "santa_bought",
      "santa_drawn_group",
      "santa_drawn_with_namesakes",
      "santa_draw_failed",
      "santa_removed_after_draw",
    ],
  },
  { title: "Бот", steps: ["notification_sent"] },
  {
    title: "Цели PRD",
    steps: [
      "first_swipe_feed",
      "first_swipe_10s",
      "swipes_20",
      "share_with_birthday",
    ],
  },
  { title: "Как открывают", steps: ["in_app_browser_seen", "pwa_standalone"] },
  {
    title: "Ошибки у людей",
    steps: ["session_expired_seen", "offline_seen", "rate_limited_seen"],
  },
];

// Конверсии воронки (P09): «из тех, кто дошёл до шага A, до шага B дошли …».
// Считаются по суммам за период — по дням людей слишком мало. Только между
// шагами одной единицы (M07, тест): человек → план дал бы 300%.
export const FUNNEL_CONVERSIONS: [from: FunnelStep, to: FunnelStep][] = [
  ["profile_created", "first_swipe"],
  ["first_swipe", "share_unlocked"],
  // Владелец: отправил → ссылка дошла → забронировали (Q01).
  ["share_unlocked", "wishlist_shared"],
  ["wishlist_shared", "share_reached"],
  ["share_reached", "reservation_received"],
  ["reservation_received", "gift_given_reserved"],
  // R09: как делятся вишлистом.
  ["wishlist_shared", "share_channel_system"],
  ["wishlist_shared", "share_channel_copy"],
  ["wishlist_shared", "share_channel_qr"],
  // Гость: открыл → забронировал; открыл → свайпнул → отправил свой (петля).
  ["guest_opened", "reservation_created"],
  ["guest_opened", "guest_first_swipe"],
  ["guest_first_swipe", "guest_shared"],
  // Q02: сценарии и компании.
  ["pick_created", "pick_opened"],
  ["pick_opened", "pick_answered"],
  ["plan_created", "plan_decided"],
  ["plan_started_group", "plan_decided_group"],
  // R06: участники Санты собирают вишлист для своего Санты.
  ["santa_joined", "santa_member_wishlist"],
  ["envelope_opened", "ward_empty"],
  ["envelope_opened", "santa_bought"],
  // Q03: цели PRD. Знаменатель «за 10 секунд» — первый свайп из ленты (M07).
  ["first_swipe_feed", "first_swipe_10s"],
  ["first_swipe", "swipes_20"],
  ["wishlist_shared", "share_with_birthday"],
  // R09: где открывают, что видели.
  ["profile_created", "in_app_browser_seen"],
  ["profile_created", "pwa_standalone"],
  ["profile_created", "session_expired_seen"],
  ["profile_created", "offline_seen"],
  ["profile_created", "rate_limited_seen"],
];

// Откуда пришёл профиль (users.created_via) — по-русски (M02 п. 3, M07).
export const VIA_LABELS: Readonly<Record<string, string>> = {
  feed: "из ленты",
  wishlist_link: "по ссылке на вишлист",
  reservation: "при брони",
  santa_invite: "по приглашению в Санту",
  plan_invite: "по приглашению в план",
  pick_link: "по ссылке-фильтру",
};
export const viaLabel = (via: null | string) =>
  via === null || via === "—" ? "не указано" : (VIA_LABELS[via] ?? "другое");

export type FunnelRow = { count: number; day: string; step: string };

const DAY_MS = 24 * 60 * 60 * 1000;

// Первый день отчёта: последние days дней, считая сегодняшний, но не раньше
// since (R02 — прогоны команды и нагрузочный тест до живой группы не в
// счёт). День — по поясу процесса: команды владельца ставят его сами (M11).
export const firstDay = (days: number, now: number, since?: string) => {
  const byDays = toDateKey(now - (days - 1) * DAY_MS);
  return since && since > byDays ? since : byDays;
};

// Полночь дня ГГГГ-ММ-ДД по поясу процесса (M11: по Бишкеку).
export const dayStart = (day: string) => new Date(`${day}T00:00:00`);

// Откуда пришли профили за период (Q01): users.created_via. Только
// счётчики, без id. Свои профили команды и репетиции не в счёт (M01, M02).
export const readProfilesByVia = async (
  db: Database,
  days: number,
  now: number,
  sinceDay?: string,
): Promise<Array<{ count: number; via: string }>> => {
  const since = dayStart(firstDay(days, now, sinceDay));
  const rows = await db
    .select({ via: users.createdVia, count: count() })
    .from(users)
    .where(and(gte(users.createdAt, since), eq(users.funnelInternal, false)))
    .groupBy(users.createdVia);
  return rows.map((row) => ({ via: row.via ?? "—", count: row.count }));
};

export const readFunnel = async (
  db: Database,
  days: number,
  now: number,
  since?: string,
): Promise<FunnelRow[]> => {
  const from = firstDay(days, now, since);
  return db
    .select({
      day: funnelDaily.day,
      step: funnelDaily.step,
      count: funnelDaily.count,
    })
    .from(funnelDaily)
    .where(gte(funnelDaily.day, from));
};

// Компании (PRD §4 п. 3; M03 п. 4, M07 п. 5): группы, где 3 и больше не
// своих человека дошли до «Решено» плана или жеребьёвки Санты. Одна и та же
// компания с планом и Сантой — одна: группы сливаются, если общих людей не
// меньше половины меньшей из них. Наружу — только число.
export const MIN_COMPANY = 3;

export const countCompanies = (
  groups: ReadonlyArray<ReadonlyArray<string>>,
): number => {
  const big = groups
    .map((group) => new Set(group))
    .filter((group) => group.size >= MIN_COMPANY);
  const parent = big.map((_, index) => index);
  const root = (index: number): number => {
    let at = index;
    while (parent[at] !== at) at = parent[at] ?? at;
    return at;
  };
  for (let a = 0; a < big.length; a += 1) {
    for (let b = a + 1; b < big.length; b += 1) {
      const left = big[a] ?? new Set<string>();
      const right = big[b] ?? new Set<string>();
      const shared = [...left].filter((id) => right.has(id)).length;
      if (shared * 2 >= Math.min(left.size, right.size)) {
        parent[root(b)] = root(a);
      }
    }
  }
  return new Set(big.map((_, index) => root(index))).size;
};

// Группы за период: решённые планы (по времени решения) и разыгранные игры
// (по времени жеребьёвки), только не свои люди. id не выходят из функции.
export const readCompanies = (
  db: Database,
  days: number,
  now: number,
  sinceDay?: string,
): Promise<number> =>
  readCompaniesFrom(db, dayStart(firstDay(days, now, sinceDay)));

export const readCompaniesFrom = async (
  db: Database,
  since: Date,
): Promise<number> => {
  const { rows } = await db.execute<{ group_key: string; user_id: string }>(
    sql`
      select 'p' || p.id as group_key, pp.user_id
      from plans p
      join plan_participants pp on pp.plan_id = p.id
      join users u on u.id = pp.user_id
      where p.status = 'decided' and not u.funnel_internal
        and coalesce((p.decision ->> 'decidedAt')::timestamptz, p.created_at)
          >= ${since}
      union all
      select 's' || g.id, m.user_id
      from santa_games g
      join santa_members m on m.game_id = g.id
      join users u on u.id = m.user_id
      where g.status = 'drawn' and m.state = 'joined'
        and not u.funnel_internal and g.drawn_at >= ${since}
    `,
  );
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    groups.set(row.group_key, [
      ...(groups.get(row.group_key) ?? []),
      row.user_id,
    ]);
  }
  return countCompanies([...groups.values()]);
};

// Доля для владельца. Больше 100% бывает, когда шаг B пришёл от людей, чей
// шаг A был до начала периода (M07 п. 4).
export const percent = (part: number, whole: number) => {
  if (whole === 0) return "—";
  if (part > whole)
    return "> 100% — шаги из разных дней, смотри больший период";
  return `${Math.round((part / whole) * 100)}%`;
};

// «12-11» → «11.12».
const shortDay = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

// Таблица «день × шаг» разделами, итоги по планам и играм, конверсии —
// текстом для терминала и /v1/ops/report. Ключ шага — в скобках в конце
// строки: по нему ищут в коде.
export const formatFunnel = (
  rows: FunnelRow[],
  days: number,
  byVia: ReadonlyArray<{ count: number; via: string }> = [],
  extra: { companies?: number } = {},
): string => {
  const dayKeys = [...new Set(rows.map((row) => row.day))].sort();
  const countOf = (day: string, step: string) =>
    rows
      .filter((row) => row.day === day && row.step === step)
      .reduce((sum, row) => sum + row.count, 0);
  const total = (step: string) =>
    rows
      .filter((row) => row.step === step)
      .reduce((sum, row) => sum + row.count, 0);

  const labelWidth = Math.max(
    ...FUNNEL_STEPS.filter((step) => STEP_LABELS[step].unit === "чел.").map(
      (step) => STEP_LABELS[step].label.length,
    ),
  );
  const cells = (values: string[]) =>
    values.map((value) => value.padStart(5)).join("  ");
  const header = `  ${"".padEnd(labelWidth)}  ${cells([...dayKeys.map(shortDay), "всего"])}`;

  const lines = [
    `Воронка за ${days} дн.`,
    "Люди — первый раз у человека; планы, игры и сообщения — каждый раз.",
  ];
  for (const section of FUNNEL_SECTIONS) {
    const people = section.steps.filter(
      (step) => STEP_LABELS[step].unit === "чел.",
    );
    const things = section.steps.filter(
      (step) => STEP_LABELS[step].unit !== "чел.",
    );
    const conversions = FUNNEL_CONVERSIONS.filter(([, to]) =>
      section.steps.includes(to),
    );
    lines.push("", section.title);
    if (people.length > 0) {
      lines.push(header);
      for (const step of people) {
        lines.push(
          `  ${STEP_LABELS[step].label.padEnd(labelWidth)}  ${cells([
            ...dayKeys.map((day) => String(countOf(day, step))),
            String(total(step)),
          ])}  (${step})`,
        );
      }
    }
    for (const step of things) {
      const { label, unit } = STEP_LABELS[step];
      const suffix = unit === "раз" ? " раз" : "";
      lines.push(`  ${label}: ${total(step)}${suffix}  (${step})`);
    }
    if (section.title === "Цели PRD" && extra.companies !== undefined) {
      lines.push(
        `  компаний (3+ не своих человека дошли до «Решено» или жеребьёвки): ${extra.companies}`,
      );
    }
    for (const [from, to] of conversions) {
      lines.push(
        `  ${STEP_LABELS[from].label} → ${STEP_LABELS[to].label}: ${percent(total(to), total(from))} (${total(to)} из ${total(from)})`,
      );
    }
  }
  if (byVia.length > 0) {
    lines.push(
      "",
      "Откуда новые профили:",
      ...byVia.map(({ via, count: n }) => `  ${viaLabel(via)}: ${n}`),
    );
  }
  return lines.join("\n");
};
