import {
  ExternalWishlistInputSchema,
  ReservationsQueryInputSchema,
  ReserveInputSchema,
  ShareLinkInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import type {
  ExternalWishlist,
  GuestWishlist,
  MyReservation,
  Reservation,
  ReservationsView,
  WishlistItem,
} from "@swipeit/core/api/wishlist/types";
import {
  ApiError,
  conflict,
  forbidden,
  nameRequired,
  notFound,
} from "@swipeit/core/errors";
import { visibleMyReservations } from "@swipeit/core/logic/my-reservations";
import { occasionForOthersFrom } from "@swipeit/core/logic/occasion";
import { hashString } from "@swipeit/core/logic/random";
import { parseInput } from "@swipeit/core/parse-input";
import type { RealtimeScope } from "@swipeit/core/realtime/types";
import { decodeWishlist, sharedItemKey } from "@swipeit/core/share-codec";
import { and, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import {
  planParticipants,
  plans,
  reservations,
  santaGames,
  santaMembers,
  users,
  wishlistItems,
} from "../../db/schema";
import { datesOf } from "../dates/handlers";
import { pickShare } from "../pick/handlers";
import { areFriends, makeFriends } from "../friends/handlers";
import { lockMe, readMe, readUser, type UserRow } from "../users/queries";
import {
  itemKeyOf,
  itemsOf,
  ownerReservationInfo,
  readMeta,
  rowToMeta,
} from "../wishlist/queries";
import {
  ensureShareLink,
  isWishlistCode,
  resolveShareLink,
} from "../share/links";

// Отправка вишлиста короткой ссылкой, гостевой вид, брони и старые длинные
// ссылки (BACKEND.md B08, §4.4, §6). Владелец не узнаёт, кто бронировал
// (§4.6, п. 1): reserver_* не уходит ни в один ответ владельцу, а в событиях
// нет поля by.

const changed = (ctx: ServerContext, scope: RealtimeScope[], id: string) =>
  ctx.events.publish({ type: "db:changed", scope, id });

// ── Гостевой вид ─────────────────────────────────────────────────────────

// Желания, которые видят друзья: только активные, «Очень хочу» сверху, без
// повторов по ключу брони (как guestItems мока).
const guestItemsOf = async (tx: Tx, ownerId: string) => {
  const seen = new Set<string>();
  return (await itemsOf(tx, ownerId))
    .filter((item) => item.status === "active")
    .sort((a, b) =>
      a.priority === b.priority
        ? a.order - b.order
        : a.priority === "top"
          ? -1
          : 1,
    )
    .filter((item) => {
      const key = itemKeyOf(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

// Вишлист глазами друга — как GET /users/:id/wishlist мока, плюс фото своих
// желаний (imageKey: ссылка живая, а не снимок). Повод — только дата и
// готовый повод: своё название значимой даты личное (§4.6, п. 3).
const guestView = async (
  ctx: ServerContext,
  owner: UserRow,
): Promise<GuestWishlist> => {
  const meta = rowToMeta(owner.id, await readMeta(ctx.tx, owner.id));
  const occasion = occasionForOthersFrom(
    await datesOf(ctx.tx, owner.id),
    meta.occasion,
    ctx.clock.now(),
  );
  return {
    owner: {
      name: owner.name ?? "",
      avatarColor: owner.avatarColor as GuestWishlist["owner"]["avatarColor"],
      userId: owner.id,
    },
    meta: {
      ...(occasion ? { occasion } : {}),
      ...(meta.message ? { message: meta.message } : {}),
    },
    items: (await guestItemsOf(ctx.tx, owner.id)).map((item) => ({
      key: itemKeyOf(item),
      ...(item.source.kind === "product"
        ? { productId: item.source.productId }
        : { custom: item.source.custom }),
      priority: item.priority,
      ...(item.variantChoice ? { variantChoice: item.variantChoice } : {}),
      ...(item.note ? { note: item.note } : {}),
    })),
  };
};

// GET /users/:id/wishlist — вишлист друга. Остальным — NOT_FOUND (§4.6,
// п. 5): не говорим даже, что профиль есть.
export const getUserWishlist: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const owner = await readUser(ctx.tx, params.id ?? "");
  if (!owner || !(await areFriends(ctx.tx, me.id, owner.id))) {
    throw notFound("Профиль не найден");
  }
  return guestView(ctx, owner);
};

// ── Короткие ссылки ──────────────────────────────────────────────────────

// POST /wishlist/share — короткая живая ссылка (§6.2): одна на вишлист,
// повторная отправка даёт её же. Сначала порог, потом имя: до 5 «Хочу»
// спрашивать его рано (как в моке).
export const shareWishlist: ServerHandler = async (ctx) => {
  const me = await lockMe(ctx);
  const meta = await readMeta(ctx.tx, me.id);
  if (!meta?.shareUnlockedAt) {
    throw forbidden("Отправить можно после 5 «Хочу»");
  }
  if (!me.name) throw nameRequired();
  return ensureShareLink(ctx, "wishlist", me.id, me.id);
};

// Участник плана или игры (организатор — тоже участник).
const isPlanMember = async (tx: Tx, planId: string, userId: string) => {
  const { rows } = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from ${plans} where id = ${planId} and owner_id = ${userId}
    ) or exists (
      select 1 from ${planParticipants}
      where plan_id = ${planId} and user_id = ${userId}
    ) as found
  `);
  return Boolean(rows[0]?.found);
};

const isSantaMember = async (tx: Tx, gameId: string, userId: string) => {
  const { rows } = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from ${santaGames} where id = ${gameId} and owner_id = ${userId}
    ) or exists (
      select 1 from ${santaMembers}
      where game_id = ${gameId} and user_id = ${userId}
    ) as found
  `);
  return Boolean(rows[0]?.found);
};

// POST /share-links { kind: plan | santa, targetId } — приглашение короткой
// ссылкой. Звать может участник; остальным — как будто плана нет.
export const createShareLink: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(ShareLinkInputSchema, body);
  const me = await readMe(ctx);
  const member =
    input.kind === "plan"
      ? await isPlanMember(ctx.tx, input.targetId, me.id)
      : await isSantaMember(ctx.tx, input.targetId, me.id);
  if (!member) {
    throw notFound(
      input.kind === "plan" ? "План не найден" : "Игра не найдена",
    );
  }
  return ensureShareLink(ctx, input.kind, input.targetId, me.id);
};

// GET /share/:code — по виду ссылки (§6.2). Вишлист: открывший с профилем
// становится другом владельцу (§4.3) — в момент открытия, а не брони, чтобы
// новый друг не подсказал владельцу, кто бронировал.
export const getShare: ServerHandler = async (ctx, { params }) => {
  const link = await resolveShareLink(ctx.tx, params.code);
  switch (link.kind) {
    case "wishlist": {
      const owner = await readUser(ctx.tx, link.targetId);
      if (!owner) throw notFound("Ссылка больше не работает");
      if (ctx.userId && ctx.userId !== owner.id) {
        const visitor = await readUser(ctx.tx, ctx.userId);
        // Только посетитель с именем (ревью R1): безымянного в «Друзьях» не
        // видно, а имя он вписывает в форме брони — и «новый друг»
        // появлялся бы у владельца ровно в момент брони, выдавая, кто
        // бронировал. Безымянному хватает доступа по коду ссылки; другом
        // он станет, открыв ссылку уже с именем.
        if (visitor?.name) {
          await makeFriends(
            ctx.tx,
            owner.id,
            visitor.id,
            "wishlist_link",
            ctx.clock,
          );
        }
      }
      return {
        kind: "wishlist",
        ownerId: owner.id,
        wishlist: await guestView(ctx, owner),
      };
    }
    case "plan":
      return { kind: "plan", planId: link.targetId };
    case "santa":
      return { kind: "santa", gameId: link.targetId };
    default: {
      // «Выбери подарок сам» — ссылка-фильтр и ответ (B09).
      const view = await pickShare(ctx, link);
      if (!view) throw notFound("Ссылка больше не работает");
      return view;
    }
  }
};

// ── Брони ────────────────────────────────────────────────────────────────

// Чей вишлист бронируют. Обычно — id пользователя сервера. Снимок старой
// длинной ссылки без владельца на сервере (id снимка «ew_…» или неизвестный
// серверу userId) — «ext:<id>» (§6.4): такие брони видят гости той же
// ссылки, владелец — нет.
type OwnerRef =
  { kind: "ext"; ref: string } | { kind: "user"; owner: UserRow; ref: string };

const ownerRefOf = async (tx: Tx, ownerId: string): Promise<OwnerRef> => {
  if (ownerId.startsWith("ext:")) return { kind: "ext", ref: ownerId };
  const owner = ownerId.startsWith("u_") ? await readUser(tx, ownerId) : null;
  return owner
    ? { kind: "user", owner, ref: owner.id }
    : { kind: "ext", ref: `ext:${ownerId}` };
};

// Доступ к броням настоящего вишлиста — друг или верный код ссылки (§4.4).
const canReserve = async (
  tx: Tx,
  meId: string,
  ownerId: string,
  share: string | undefined,
) =>
  (await areFriends(tx, meId, ownerId)) ||
  (await isWishlistCode(tx, share, ownerId));

// GET /reservations?ownerId&share? — владельцу только количество (сюрприз),
// гостю — какие желания заняты, какое его и что уже подарено, без имён.
// Без доступа — пустой список: не говорим, есть ли такой вишлист.
export const getReservations: ServerHandler = async (ctx, { query }) => {
  const input = parseInput(ReservationsQueryInputSchema, query);
  const me = await readMe(ctx);
  const target = await ownerRefOf(ctx.tx, input.ownerId);

  let activeKeys = new Set<string>();
  if (target.kind === "user") {
    if (target.owner.id === me.id) {
      const items = await itemsOf(ctx.tx, me.id);
      const meta = rowToMeta(me.id, await readMeta(ctx.tx, me.id));
      const info = await ownerReservationInfo(
        ctx.tx,
        me.id,
        items,
        meta,
        ctx.clock.now(),
      );
      const view: ReservationsView = {
        role: "owner",
        count: info.reservationCount ?? 0,
      };
      return view;
    }
    if (!(await canReserve(ctx.tx, me.id, target.owner.id, input.share))) {
      const view: ReservationsView = { role: "guest", items: [] };
      return view;
    }
    activeKeys = new Set(
      (await guestItemsOf(ctx.tx, target.owner.id)).map(itemKeyOf),
    );
  }

  const rows = await ctx.tx
    .select({
      id: reservations.id,
      itemKey: reservations.itemKey,
      reserverId: reservations.reserverId,
      closedAt: reservations.closedAt,
    })
    .from(reservations)
    .where(eq(reservations.ownerRef, target.ref));
  // Желание вернули из «Подарили» — закрытая бронь больше не значит «Уже
  // подарено»: желание снова свободно.
  const view: ReservationsView = {
    role: "guest",
    items: rows
      .filter((row) => !(row.closedAt && activeKeys.has(row.itemKey)))
      .map((row) => ({
        id: row.id,
        itemKey: row.itemKey,
        mine: row.reserverId === me.id,
        closed: Boolean(row.closedAt),
      })),
  };
  return view;
};

// Ошибка уникального индекса PostgreSQL (23505) — в том числе обёрнутая
// Drizzle.
const isUniqueViolation = (error: unknown): boolean => {
  const value = error as { cause?: unknown; code?: string };
  return (
    value?.code === "23505" ||
    (value?.cause ? isUniqueViolation(value.cause) : false)
  );
};

// POST /reservations — «Забронирую я». Гонку двух броней одного желания
// решает уникальный индекс (§2.6): вторая — CONFLICT. Безымянному профилю
// имя из тела сохраняется и в профиль (§3.1). guestId сервер не принимает:
// автор брони — профиль с токеном.
export const createReservation: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(ReserveInputSchema, body);
  const me = await lockMe(ctx);
  if (input.ownerId === me.id) {
    throw forbidden("Это твой вишлист — бронируют друзья");
  }
  const target = await ownerRefOf(ctx.tx, input.ownerId);

  if (target.kind === "user") {
    // Подделанная старая ссылка с id настоящего владельца не трогает его
    // вишлист: бронирует только друг или гость по коду (§6.4).
    if (!(await canReserve(ctx.tx, me.id, target.owner.id, input.share))) {
      throw forbidden("Бронировать могут только друзья по ссылке");
    }
    // Живое желание — под FOR SHARE (ревью R2): одновременное «Мне это
    // подарили» дождётся конца брони и закроет её, а бронь, начатая после
    // «подарили», увидит статус given. Без блокировки оставалась открытая
    // бронь на подаренном желании.
    const key = input.itemKey;
    const [active] = await ctx.tx
      .select({ id: wishlistItems.id })
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, target.owner.id),
          isNull(wishlistItems.deletedAt),
          eq(wishlistItems.status, "active"),
          key.startsWith("custom:")
            ? eq(wishlistItems.id, key.slice("custom:".length))
            : eq(wishlistItems.productId, key),
        ),
      )
      .limit(1)
      .for("share");
    if (!active) {
      const items = await itemsOf(ctx.tx, target.owner.id);
      if (items.some((entry: WishlistItem) => itemKeyOf(entry) === key)) {
        throw conflict("Это уже подарили");
      }
      throw notFound("Желание не найдено");
    }
  }

  // Имя брони — из профиля; безымянный называется в форме брони, и имя
  // остаётся в профиле.
  let name = me.name;
  if (!name) {
    const typed = input.name?.trim();
    if (!typed) throw nameRequired();
    name = typed;
    await ctx.tx.update(users).set({ name }).where(eq(users.id, me.id));
    ctx.events.publish({ type: "db:changed", scope: ["users"], id: me.id });
  }

  const [taken] = await ctx.tx
    .select()
    .from(reservations)
    .where(
      and(
        eq(reservations.ownerRef, target.ref),
        eq(reservations.itemKey, input.itemKey),
        isNull(reservations.closedAt),
      ),
    )
    .limit(1);
  const toReservation = (
    row: typeof reservations.$inferSelect,
  ): Reservation => ({
    id: row.id,
    ownerId: input.ownerId,
    itemKey: row.itemKey,
    reserver: { userId: row.reserverId, name: row.reserverName },
    at: row.at.toISOString(),
  });
  if (taken?.reserverId === me.id) return toReservation(taken);
  if (taken) throw conflict("Кто-то уже выбрал этот подарок");

  let created: typeof reservations.$inferSelect | undefined;
  try {
    [created] = await ctx.tx
      .insert(reservations)
      .values({
        id: `rs_${nanoid(10)}`,
        ownerRef: target.ref,
        itemKey: input.itemKey,
        reserverId: me.id,
        reserverName: name,
        at: new Date(ctx.clock.now()),
      })
      .returning();
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw conflict("Кто-то уже выбрал этот подарок");
    }
    throw error;
  }
  if (!created) throw new Error("Бронь не записалась");
  changed(ctx, ["reservations", "wishlist"], target.ref);
  return toReservation(created);
};

// DELETE /reservations/:id — снять свою бронь.
export const deleteReservation: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const [row] = await ctx.tx
    .select({
      id: reservations.id,
      ownerRef: reservations.ownerRef,
      reserverId: reservations.reserverId,
    })
    .from(reservations)
    .where(eq(reservations.id, params.id ?? ""))
    .limit(1);
  if (!row) throw notFound("Бронь не найдена");
  if (row.reserverId !== me.id) throw forbidden("Это не твоя бронь");
  await ctx.tx.delete(reservations).where(eq(reservations.id, row.id));
  changed(ctx, ["reservations", "wishlist"], row.ownerRef);
  return { ok: true };
};

// ── Старые длинные ссылки (§6.4) ─────────────────────────────────────────

// POST /external-wishlists — разобрать снимок из ссылки и вернуть его. В
// базу не пишем: снимки старых ссылок сервер не хранит.
export const importExternalWishlist: ServerHandler = async (ctx, { body }) => {
  const { encoded } = parseInput(ExternalWishlistInputSchema, body);
  const shared = decodeWishlist(encoded);
  if (!shared) throw new ApiError(400, "VALIDATION", "Ссылка повреждена");
  const external: ExternalWishlist = {
    id: `ew_${hashString(encoded).toString(36)}`,
    owner: shared.owner,
    meta: { occasion: shared.occasion, message: shared.message },
    items: shared.items.map((item) => ({
      key: sharedItemKey(item),
      productId: item.productId,
      custom: item.custom,
      priority: item.priority,
      variantChoice: item.variantChoice,
      note: item.note,
    })),
    openedAt: new Date(ctx.clock.now()).toISOString(),
  };
  return external;
};

// ── «Я дарю» ─────────────────────────────────────────────────────────────

// GET /me/reservations — свои брони (auto-tasks P02). Брони по старым
// ссылкам (ext:) сервер показать не может: снимков он не хранит — их нет.
// Других бронирующих в ответе нет; повод — как его видят гости.
export const getMyReservations: ServerHandler = async (ctx) => {
  const me = await readMe(ctx);
  const now = ctx.clock.now();
  const rows = await ctx.tx
    .select()
    .from(reservations)
    .where(eq(reservations.reserverId, me.id));
  const list: MyReservation[] = [];
  for (const row of rows) {
    if (row.ownerRef.startsWith("ext:")) continue;
    const owner = await readUser(ctx.tx, row.ownerRef);
    if (!owner) continue;
    const item = (await itemsOf(ctx.tx, owner.id)).find(
      (entry) => itemKeyOf(entry) === row.itemKey,
    );
    if (!item) continue;
    const meta = rowToMeta(owner.id, await readMeta(ctx.tx, owner.id));
    const occasion = occasionForOthersFrom(
      await datesOf(ctx.tx, owner.id),
      meta.occasion,
      now,
    );
    list.push({
      id: row.id,
      itemKey: row.itemKey,
      closed: Boolean(row.closedAt),
      ...(row.closedAt ? { closedAt: row.closedAt.toISOString() } : {}),
      at: row.at.toISOString(),
      owner: {
        id: owner.id,
        name: owner.name ?? "",
        avatarColor: owner.avatarColor as MyReservation["owner"]["avatarColor"],
      },
      item:
        item.source.kind === "product"
          ? { productId: item.source.productId }
          : {
              custom: {
                title: item.source.custom.title,
                ...(item.source.custom.priceMin !== undefined
                  ? { priceMin: item.source.custom.priceMin }
                  : {}),
                ...(item.source.custom.priceMax !== undefined
                  ? { priceMax: item.source.custom.priceMax }
                  : {}),
                ...(item.source.custom.url
                  ? { url: item.source.custom.url }
                  : {}),
              },
            },
      ...(occasion ? { occasion } : {}),
    });
  }
  return visibleMyReservations(list, now);
};
