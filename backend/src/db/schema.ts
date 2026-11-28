// Схема PostgreSQL (BACKEND.md §4.2). Каталог в базе не храним (§8):
// product_id и activity_id — без внешних ключей. Вложенное, что не ищем и не
// меняем по частям, — jsonb. То, что меняют несколько человек одновременно, —
// отдельные строки: участники, свайпы и голоса плана, участники и пары Санты,
// брони.
//
// Миграции после первого деплоя в prod — только добавляющие (§4.2).
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({
  dataType: () => "bytea",
});

// Время — timestamptz, в ответах — ISO-строки (§4.1).
const at = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => at("created_at").notNull().defaultNow();

// Перечисления — текст с CHECK, а не enum PostgreSQL: новое значение —
// добавляющая миграция без ALTER TYPE (§4.2).
const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} in (${values.map((value) => `'${value}'`).join(", ")})`);

// «ММ-ДД»: день рождения и значимые даты без года.
const monthDay = (column: string) =>
  sql.raw(`${column} ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'`);

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    avatarColor: text("avatar_color").notNull(),
    birthday: text("birthday"),
    interests: text("interests")
      .array()
      .notNull()
      .default(sql`'{}'`),
    mutedInterests: text("muted_interests")
      .array()
      .notNull()
      .default(sql`'{}'`),
    audience: text("audience").notNull().default("all"),
    taste: jsonb("taste"),
    seenHints: text("seen_hints")
      .array()
      .notNull()
      .default(sql`'{}'`),
    dismissedReminders: text("dismissed_reminders")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    // Откуда пришёл профиль (Q01): feed, wishlist_link, reservation…
    // Служебное поле воронки, уходит вместе со строкой.
    createdVia: text("created_via"),
    // Удалённый профиль (§3.4): строка остаётся без имени, чтобы чужие планы
    // и игры показывали «Удалённый профиль».
    deletedAt: at("deleted_at"),
    // Шаги воронки, которые человек уже прошёл (auto-tasks P09): счётчик в
    // funnel_daily растёт только при первом шаге. Живёт в профиле и
    // удаляется вместе с ним.
    funnelSteps: text("funnel_steps")
      .array()
      .notNull()
      .default(sql`'{}'`),
  },
  () => [
    check("users_birthday_format", monthDay("birthday")),
    check("users_audience", oneOf("audience", ["all", "female", "male"])),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Только SHA-256 токена, сам токен у клиента (§3.2).
    tokenHash: bytea("token_hash").notNull(),
    createdAt: createdAt(),
    lastUsedAt: at("last_used_at").notNull().defaultNow(),
    revokedAt: at("revoked_at"),
    userAgent: varchar("user_agent", { length: 200 }),
  },
  (table) => [
    uniqueIndex("sessions_token_hash").on(table.tokenHash),
    index("sessions_user_id").on(table.userId),
  ],
);

export const identities = pgTable(
  "identities",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.subject] }),
    index("identities_user_id").on(table.userId),
    check("identities_provider", oneOf("provider", ["telegram"])),
  ],
);

// Дружба — две строки, в обе стороны (§4.3).
export const friendships = pgTable(
  "friendships",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: text("friend_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.friendId] }),
    index("friendships_friend_id").on(table.friendId),
    check(
      "friendships_source",
      oneOf("source", ["plan", "santa", "wishlist_link"]),
    ),
    check("friendships_not_self", sql`user_id <> friend_id`),
  ],
);

export const importantDates = pgTable(
  "important_dates",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    preset: text("preset"),
    label: text("label"),
    autoNumber: integer("auto_number").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("important_dates_owner_id").on(table.ownerId),
    check("important_dates_date_format", monthDay("date")),
  ],
);

export const productSwipes = pgTable(
  "product_swipes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: text("product_id").notNull(),
    decision: text("decision").notNull(),
    // "self" или "pick:<id>" (§4.2).
    contextKey: text("context_key").notNull(),
    pickRequestId: text("pick_request_id"),
    variantChoice: jsonb("variant_choice"),
    at: at("at").notNull(),
    // Порядок записи (B06): по нему считается вкус и выбирается свайп для
    // «Вернуть». Время для этого не годится: два свайпа одной миллисекунды
    // (двойной тап, подставные часы в тестах) неразличимы. Повторный свайп
    // берёт новый номер — он «последний».
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (table) => [
    // Повторный свайп той же карточки в том же контексте заменяет прежний:
    // запись — через upsert по этому ключу.
    uniqueIndex("product_swipes_user_context_product").on(
      table.userId,
      table.contextKey,
      table.productId,
    ),
    index("product_swipes_user_context_seq").on(
      table.userId,
      table.contextKey,
      table.seq,
    ),
    check(
      "product_swipes_decision",
      oneOf("decision", ["like", "superlike", "pass"]),
    ),
  ],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind").notNull(),
    productId: text("product_id"),
    custom: jsonb("custom"),
    priority: text("priority").notNull().default("normal"),
    sortOrder: integer("sort_order").notNull(),
    variantChoice: jsonb("variant_choice"),
    note: text("note"),
    status: text("status").notNull().default("active"),
    given: jsonb("given"),
    addedAt: at("added_at").notNull(),
    // «Удалить» → 10 минут на «Вернуть», потом фоновая чистка (B07).
    deletedAt: at("deleted_at"),
  },
  (table) => [
    index("wishlist_items_owner_status_order").on(
      table.ownerId,
      table.status,
      table.sortOrder,
    ),
    // Один товар — одно живое желание.
    uniqueIndex("wishlist_items_owner_product_active")
      .on(table.ownerId, table.productId)
      .where(sql`status = 'active' and deleted_at is null`),
    check(
      "wishlist_items_source_kind",
      oneOf("source_kind", ["product", "custom"]),
    ),
    check("wishlist_items_priority", oneOf("priority", ["normal", "top"])),
    check("wishlist_items_status", oneOf("status", ["active", "given"])),
    check(
      "wishlist_items_source",
      sql`(source_kind = 'product' and product_id is not null) or (source_kind = 'custom' and custom is not null)`,
    ),
  ],
);

export const wishlistMeta = pgTable("wishlist_meta", {
  ownerId: text("owner_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  occasion: jsonb("occasion"),
  message: text("message"),
  hideReservationCount: boolean("hide_reservation_count")
    .notNull()
    .default(false),
  shareUnlockedAt: at("share_unlocked_at"),
  dismissedGivenHintFor: text("dismissed_given_hint_for"),
});

export const reservations = pgTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    // Обычно id пользователя; для старых длинных ссылок — "ext:<id снимка>"
    // (§6.4), поэтому без внешнего ключа.
    ownerRef: text("owner_ref").notNull(),
    itemKey: text("item_key").notNull(),
    reserverId: text("reserver_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reserverName: text("reserver_name").notNull(),
    at: at("at").notNull(),
    closedAt: at("closed_at"),
  },
  (table) => [
    // Гонку двух броней одного подарка решает этот индекс (§2.6): вторая
    // открытая бронь того же желания падает → CONFLICT.
    uniqueIndex("reservations_owner_item_open")
      .on(table.ownerRef, table.itemKey)
      .where(sql`closed_at is null`),
    index("reservations_owner_ref").on(table.ownerRef),
    index("reservations_reserver_id").on(table.reserverId),
  ],
);

export const shareLinks = pgTable(
  "share_links",
  {
    code: text("code").primaryKey(),
    kind: text("kind").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    targetId: text("target_id").notNull(),
    createdAt: createdAt(),
    revokedAt: at("revoked_at"),
  },
  (table) => [
    // Одна живая ссылка на вишлист, план, игру (§6.2).
    uniqueIndex("share_links_kind_target_live")
      .on(table.kind, table.targetId)
      .where(sql`revoked_at is null`),
    check(
      "share_links_kind",
      oneOf("kind", [
        "wishlist",
        "pick_request",
        "pick_answer",
        "plan",
        "santa",
      ]),
    ),
  ],
);

export const pickRequests = pgTable(
  "pick_requests",
  {
    id: text("id").primaryKey(),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toName: text("to_name"),
    filters: jsonb("filters").notNull(),
    hidePrices: boolean("hide_prices").notNull().default(false),
    occasion: jsonb("occasion"),
    message: text("message"),
    createdAt: createdAt(),
  },
  (table) => [index("pick_requests_from_user_id").on(table.fromUserId)],
);

export const pickAnswers = pgTable(
  "pick_answers",
  {
    requestId: text("request_id")
      .notNull()
      .references(() => pickRequests.id, { onDelete: "cascade" }),
    byUserId: text("by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    picks: jsonb("picks").notNull(),
    answeredAt: at("answered_at").notNull(),
  },
  // Один ответ на друга: повтор заменяет (§4.4).
  (table) => [primaryKey({ columns: [table.requestId, table.byUserId] })],
);

// Своё занятие: поля Activity — одним jsonb (их не ищут и не меняют по
// частям), отдельно — автор и фото.
export const customActivities = pgTable(
  "custom_activities",
  {
    id: text("id").primaryKey(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activity: jsonb("activity").notNull(),
    imageKey: text("image_key"),
    createdAt: createdAt(),
  },
  (table) => [index("custom_activities_created_by").on(table.createdBy)],
);

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: text("mode").notNull(),
    deadline: at("deadline"),
    status: text("status").notNull(),
    matchRule: text("match_rule").notNull().default("all"),
    filters: jsonb("filters").notNull(),
    deck: text("deck").array().notNull(),
    customActivityIds: text("custom_activity_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    decision: jsonb("decision"),
    // Организатор показал итоги, не дождавшись всех (auto-tasks P04).
    closedEarly: boolean("closed_early").notNull().default(false),
    // Шаги воронки, уже засчитанные этому плану (Q02): «Отменить решение»
    // и снова «Решено» — всё ещё одна компания.
    funnelSteps: text("funnel_steps")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    // Порядок создания: «новые сверху» при равном времени (B10).
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (table) => [
    // Для планировщика: «До даты» с наступившим дедлайном (B13).
    index("plans_status_deadline").on(table.status, table.deadline),
    check("plans_mode", oneOf("mode", ["live", "deadline"])),
    check(
      "plans_status",
      oneOf("status", ["lobby", "swiping", "results", "decided"]),
    ),
    check("plans_match_rule", oneOf("match_rule", ["all", "majority"])),
    check("plans_deadline_mode", sql`mode = 'live' or deadline is not null`),
  ],
);

// Участник остаётся строкой и после удаления своего профиля (§3.4): профиль
// не удаляется физически (users.deleted_at), поэтому внешний ключ без
// каскада — его обезличивает код.
export const planParticipants = pgTable(
  "plan_participants",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    ready: boolean("ready").notNull().default(false),
    finished: boolean("finished").notNull().default(false),
    joinedAt: at("joined_at").notNull(),
    // Порядок участников: организатор, позванные, вступившие (B10).
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.userId] }),
    index("plan_participants_user_id").on(table.userId),
  ],
);

export const planSwipes = pgTable(
  "plan_swipes",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
    decision: text("decision").notNull(),
    at: at("at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.userId, table.activityId] }),
    check("plan_swipes_decision", oneOf("decision", ["like", "pass"])),
  ],
);

export const planVotes = pgTable(
  "plan_votes",
  {
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    activityId: text("activity_id").notNull(),
  },
  // Один голос на человека: повтор заменяет.
  (table) => [primaryKey({ columns: [table.planId, table.userId] })],
);

export const santaGames = pgTable(
  "santa_games",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    budget: integer("budget").notNull(),
    exchangeDate: date("exchange_date").notNull(),
    // Жеребьёвка по дате — планировщик сервера (B13); нет — вручную.
    drawAt: at("draw_at"),
    status: text("status").notNull().default("gathering"),
    exclusions: jsonb("exclusions")
      .notNull()
      .default(sql`'[]'::jsonb`),
    drawnAt: at("drawn_at"),
    // Кого организатор убрал из игры (Q05): снова вступить не могут.
    removedIds: text("removed_ids")
      .array()
      .notNull()
      .default(sql`'{}'`),
    createdAt: createdAt(),
    // Порядок создания: «новые сверху» при равном времени (B11).
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (table) => [
    index("santa_games_status_draw_at").on(table.status, table.drawAt),
    check("santa_games_status", oneOf("status", ["gathering", "drawn"])),
    check("santa_games_budget", sql`budget >= 0`),
  ],
);

export const santaMembers = pgTable(
  "santa_members",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => santaGames.id, { onDelete: "cascade" }),
    // Как участник плана: строка остаётся после удаления профиля (§3.4).
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    state: text("state").notNull().default("invited"),
    openedAt: at("opened_at"),
    boughtAt: at("bought_at"),
    joinedAt: at("joined_at"),
    // Порядок участников: организатор, позванные, вступившие (B11).
    seq: bigserial("seq", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.userId] }),
    index("santa_members_user_id").on(table.userId),
    check("santa_members_state", oneOf("state", ["invited", "joined"])),
  ],
);

// Пары читает только функция «мой подопечный» (§4.6, п. 2).
export const santaAssignments = pgTable(
  "santa_assignments",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => santaGames.id, { onDelete: "cascade" }),
    santaId: text("santa_id")
      .notNull()
      .references(() => users.id),
    wardId: text("ward_id")
      .notNull()
      .references(() => users.id),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.santaId] }),
    // У одного подопечного не бывает двух Сант.
    uniqueIndex("santa_assignments_game_ward").on(table.gameId, table.wardId),
    check("santa_assignments_not_self", sql`santa_id <> ward_id`),
  ],
);

export const uploads = pgTable(
  "uploads",
  {
    key: text("key").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("uploads_owner_id").on(table.ownerId)],
);

// Воронка по дням (auto-tasks P09): только день, шаг и число — ни id, ни
// имён, ни кодов ссылок. Цель демо — увидеть, где люди отваливаются.
export const funnelDaily = pgTable(
  "funnel_daily",
  {
    // День по календарю Бишкека (§2.5).
    day: date("day").notNull(),
    step: text("step").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.step] })],
);
