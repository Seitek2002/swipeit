import {
  ExternalWishlistInputSchema,
  MetaPatchInputSchema,
  OccasionInputSchema,
  ReservationDeleteQuerySchema,
  ReservationsQueryInputSchema,
  ReserveInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import { visibleMyReservations } from "@swipeit/core/logic/my-reservations";
import {
  openedWishlists,
  snapshotForReservation,
} from "@swipeit/core/logic/opened-wishlists";
import { nanoid } from "nanoid";

import { toDateKey } from "@/shared/lib/format";
import {
  decodeWishlist,
  encodeWishlist,
  sharedItemKey,
} from "@/shared/lib/share-codec";

import type {
  ExternalWishlist,
  GuestWishlist,
  MyReservation,
  OpenedWishlist,
  Reservation,
  ReservationsView,
} from "../../wishlist/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { ApiError, notFound, validation } from "../errors";
import { normalizeOccasion, occasionForOthers } from "../occasion";
import { hashString } from "../random";
import { parseInput, requireNamed, requireUser } from "./common";
import { itemKeyOf } from "./wishlist";

const changed = (
  ctx: HandlerContext,
  scope: Array<"reservations" | "wishlist">,
) =>
  ctx.realtime.publish({
    type: "db:changed",
    scope,
    by: ctx.userId ?? "guest",
  });

// ── Повод, отправка, подсказка ──────────────────────────────────────────

// Повод из запроса — общая схема core (BACKEND.md B07).
export { OccasionInputSchema };

// Один ключ — одно желание в гостевом виде: товар, лайкнутый заново, пока
// старая копия в «Подарили», после «Вернуть» оказался бы дважды.
const uniqueByKey = <T>(items: T[], keyOf: (item: T) => string) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Желания, которые видят друзья: только активные, «Очень хочу» сверху,
// без повторов по ключу брони.
export const guestItems = (db: Db, ownerId: string) =>
  uniqueByKey(
    (db.wishlistItems[ownerId] ?? [])
      .filter((item) => item.status === "active")
      .sort((a, b) =>
        a.priority === b.priority
          ? a.order - b.order
          : a.priority === "top"
            ? -1
            : 1,
      ),
    itemKeyOf,
  );

// PATCH /wishlist/meta — повод, сообщение, «Не показывать мне даже это».
export const updateMeta: Handler = async (ctx, { body }) => {
  const patch = parseInput(MetaPatchInputSchema, body);
  const now = ctx.clock.now();
  const meta = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const current = (db.wishlistMeta[user.id] ??= {
      ownerId: user.id,
      hideReservationCount: false,
    });
    if (patch.occasion === null) delete current.occasion;
    else if (patch.occasion) {
      current.occasion = normalizeOccasion(db, user, patch.occasion, now);
    }
    if (patch.message !== undefined)
      current.message = patch.message.trim() || undefined;
    if (patch.hideReservationCount !== undefined) {
      current.hideReservationCount = patch.hideReservationCount;
    }
    return current;
  });
  changed(ctx, ["wishlist"]);
  return meta;
};

// POST /wishlist/share — ссылка со снимком вишлиста (TECH_SPEC §8): только
// активные желания, фото своих желаний не кладём. Путь относительный —
// адрес сайта (и basePath) добавляет клиент.
export const shareWishlist: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const profile = requireUser(ctx, db);
  const meta = db.wishlistMeta[profile.id];
  if (!meta?.shareUnlockedAt) {
    throw new ApiError(403, "FORBIDDEN", "Отправить можно после 5 «Хочу»");
  }
  // Имя — после проверки порога: до 5 «Хочу» спрашивать его рано.
  const user = requireNamed(profile);
  const items = guestItems(db, user.id);
  const encoded = encodeWishlist({
    owner: {
      name: user.name,
      avatarColor: user.avatarColor,
      userId: user.id,
      birthday: user.birthday,
    },
    // У значимой даты — только дата и готовый повод: своё название и
    // dateId личные и в ссылку не попадают (TECH_SPEC §8).
    occasion: occasionForOthers(db, user.id, ctx.clock.now()),
    message: meta.message,
    items: items.map((item) => ({
      productId:
        item.source.kind === "product" ? item.source.productId : undefined,
      key: item.source.kind === "custom" ? itemKeyOf(item) : undefined,
      custom:
        item.source.kind === "custom"
          ? {
              title: item.source.custom.title,
              priceMin: item.source.custom.priceMin,
              priceMax: item.source.custom.priceMax,
              url: item.source.custom.url,
            }
          : undefined,
      priority: item.priority,
      variantChoice: item.variantChoice,
      note: item.note,
    })),
  });
  // Вишлист ушёл друзьям — через 30–90 с боты-друзья бронируют по подарку
  // (TECH_SPEC §7).
  ctx.realtime.publish({
    type: "trigger",
    name: "wishlist:shared",
    id: user.id,
    by: user.id,
  });
  return { url: `/w/?d=${encoded}` };
};

// POST /wishlist/given-hint/dismiss — «Скрыть» подсказку «Возможно, тебе
// подарили это» для текущего повода.
export const dismissGivenHint: Handler = async (ctx) => {
  await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const meta = db.wishlistMeta[user.id];
    if (meta?.occasion?.date) meta.dismissedGivenHintFor = meta.occasion.date;
  });
  changed(ctx, ["wishlist"]);
  return { ok: true };
};

const openReservations = (db: Db, ownerId: string) =>
  db.reservations.filter(
    (reservation) => reservation.ownerId === ownerId && !reservation.closedAt,
  );

// Счётчик броней и подсказка после повода — для GET /wishlist владельца.
export const ownerReservationInfo = (db: Db, ownerId: string, now: number) => {
  const meta = db.wishlistMeta[ownerId];
  const activeKeys = new Set(
    (db.wishlistItems[ownerId] ?? [])
      .filter((item) => item.status === "active")
      .map(itemKeyOf),
  );
  const reservedKeys = new Set(
    openReservations(db, ownerId)
      .map((reservation) => reservation.itemKey)
      .filter((key) => activeKeys.has(key)),
  );
  // Повод прошёл — брони больше не секрет: показываем, что, возможно, уже
  // подарили (DESIGN.md §8.3, P1). До даты повода брони скрыты.
  const date = meta?.occasion?.date;
  const passed = Boolean(date && date < toDateKey(now));
  const givenHintIds =
    passed && meta?.dismissedGivenHintFor !== date
      ? (db.wishlistItems[ownerId] ?? [])
          .filter(
            (item) =>
              item.status === "active" && reservedKeys.has(itemKeyOf(item)),
          )
          .map((item) => item.id)
      : [];
  return {
    reservationCount: meta?.hideReservationCount ? null : reservedKeys.size,
    givenHintIds,
  };
};

// ── Гостевой просмотр ───────────────────────────────────────────────────

// Путь гостевой ссылки — как в POST /wishlist/share.
const guestLinkOf = (encoded: string) => `/w/?d=${encoded}`;

// POST /external-wishlists — импорт снимка из ссылки на стороне гостя.
// Кто открыл — запоминаем для «Открывал по ссылке» (X03): профиль или гость
// без профиля по guestId (его снимки переходят к профилю, как и брони).
export const importExternalWishlist: Handler = async (ctx, { body }) => {
  const { encoded, guestId } = parseInput(ExternalWishlistInputSchema, body);
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
    openedAt: nowIso(ctx.clock),
    link: guestLinkOf(encoded),
  };
  const viewer = reserverId(ctx, guestId);
  await ctx.db.write((db) => {
    db.externalWishlists[external.id] = external;
    if (viewer) {
      (db.openedWishlists[viewer] ??= {})[external.id] = external.openedAt;
    }
  });
  return external;
};

// GET /me/opened-wishlists — «Открывал по ссылке» на «Друзьях» (X03).
export const getOpenedWishlists: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const opened = db.openedWishlists[user.id] ?? {};
  const list: OpenedWishlist[] = openedWishlists(
    Object.entries(opened).flatMap(([id, openedAt]) => {
      const snapshot = db.externalWishlists[id];
      return snapshot ? [{ snapshot, openedAt }] : [];
    }),
    { friendIds: new Set(db.friends[user.id] ?? []), meId: user.id },
  );
  return list;
};

// GET /users/:id/wishlist — чужой вишлист: только активные желания (TECH_SPEC §6).
export const getUserWishlist: Handler = async (ctx, { params }) => {
  const db = await ctx.db.read();
  const owner = db.users[params.id ?? ""];
  if (!owner) throw notFound("Профиль не найден");
  const meta = db.wishlistMeta[owner.id];
  const occasion = occasionForOthers(db, owner.id, ctx.clock.now());
  const view: GuestWishlist = {
    owner: {
      // Профиль друга без имени сюда не попадает (его нет в друзьях), но
      // по прямому id — пустая строка, а не undefined.
      name: owner.name ?? "",
      avatarColor: owner.avatarColor,
      userId: owner.id,
    },
    meta: { occasion, message: meta?.message },
    items: guestItems(db, owner.id).map((item) => ({
      key: itemKeyOf(item),
      productId:
        item.source.kind === "product" ? item.source.productId : undefined,
      custom:
        item.source.kind === "custom"
          ? {
              title: item.source.custom.title,
              priceMin: item.source.custom.priceMin,
              priceMax: item.source.custom.priceMax,
              url: item.source.custom.url,
            }
          : undefined,
      priority: item.priority,
      variantChoice: item.variantChoice,
      note: item.note,
    })),
  };
  return view;
};

// ── Брони ───────────────────────────────────────────────────────────────

// Кто бронирует: пользователь вкладки или гость без профиля (его id живёт
// в localStorage гостя и приходит в запросе).
const reserverId = (ctx: HandlerContext, guestId?: string) =>
  ctx.userId ?? guestId;

// GET /reservations?ownerId — владельцу только количество (сюрприз!), гостю —
// какие желания заняты, какое из них его и что уже подарено.
export const getReservations: Handler = async (ctx, { query }) => {
  const { ownerId, guestId } = parseInput(ReservationsQueryInputSchema, query);
  const db = await ctx.db.read();
  if (ctx.userId === ownerId) {
    const view: ReservationsView = {
      role: "owner",
      count:
        ownerReservationInfo(db, ownerId, ctx.clock.now()).reservationCount ??
        0,
    };
    return view;
  }
  const me = reserverId(ctx, guestId);
  // Желание вернули из «Подарили» — закрытая бронь больше не значит «Уже
  // подарено»: желание снова свободно (брони не восстанавливаются, TECH_SPEC
  // §6). Владелец с другого устройства в этой базе не виден — там снимок.
  const activeKeys = new Set(guestItems(db, ownerId).map(itemKeyOf));
  const view: ReservationsView = {
    role: "guest",
    items: db.reservations
      .filter(
        (reservation) =>
          reservation.ownerId === ownerId &&
          !(reservation.closedAt && activeKeys.has(reservation.itemKey)),
      )
      .map((reservation) => ({
        id: reservation.id,
        itemKey: reservation.itemKey,
        mine: Boolean(me) && reservation.reserver.userId === me,
        closed: Boolean(reservation.closedAt),
      })),
  };
  return view;
};

// POST /reservations — «Забронирую я».
export const createReservation: Handler = async (ctx, { body }) => {
  const input = parseInput(ReserveInputSchema, body);
  const me = reserverId(ctx, input.guestId);
  if (!me) throw new ApiError(400, "VALIDATION", "Не понятно, кто бронирует");
  if (me === input.ownerId) {
    throw new ApiError(403, "FORBIDDEN", "Это твой вишлист — бронируют друзья");
  }
  const reservation = await ctx.db.write((db): Reservation => {
    // Бронь от профиля — под его именем; профиль без имени получает
    // NAME_REQUIRED, и клиент сохраняет имя в профиль (DESIGN §8.5). Гость
    // без профиля (или со старой сессией, которой нет в базе) называется
    // только для брони.
    const profile = ctx.userId ? db.users[ctx.userId] : undefined;
    const name = profile ? requireNamed(profile).name : input.name;
    if (!name) throw validation("Напиши, как тебя зовут");
    const taken = db.reservations.find(
      (entry) =>
        entry.ownerId === input.ownerId &&
        entry.itemKey === input.itemKey &&
        !entry.closedAt,
    );
    if (taken && taken.reserver.userId === me) return taken;
    if (taken)
      throw new ApiError(409, "CONFLICT", "Кто-то уже выбрал этот подарок");
    const created: Reservation = {
      id: `rs_${nanoid(10)}`,
      ownerId: input.ownerId,
      itemKey: input.itemKey,
      reserver: { userId: me, name },
      at: nowIso(ctx.clock),
    };
    db.reservations.push(created);
    return created;
  });
  changed(ctx, ["reservations", "wishlist"]);
  return reservation;
};

// DELETE /reservations/:id — снять свою бронь.
export const deleteReservation: Handler = async (ctx, { params, query }) => {
  const { guestId } = parseInput(ReservationDeleteQuerySchema, query);
  const me = reserverId(ctx, guestId);
  await ctx.db.write((db) => {
    const reservation = db.reservations.find((entry) => entry.id === params.id);
    if (!reservation) throw notFound("Бронь не найдена");
    if (!me || reservation.reserver.userId !== me) {
      throw new ApiError(403, "FORBIDDEN", "Это не твоя бронь");
    }
    db.reservations = db.reservations.filter(
      (entry) => entry.id !== reservation.id,
    );
  });
  changed(ctx, ["reservations", "wishlist"]);
  return { ok: true };
};

// GET /me/reservations — «Я дарю» (auto-tasks P02): свои брони у друзей и по
// старым ссылкам, если про желание есть данные. Других бронирующих в ответе
// нет; повод — как его видят гости.
export const getMyReservations: Handler = async (ctx, { query }) => {
  const { guestId } = parseInput(ReservationDeleteQuerySchema, query);
  const db = await ctx.db.read();
  const me = reserverId(ctx, guestId);
  if (!me) return [];
  const now = ctx.clock.now();
  // Снимок, к которому строка «Я дарю» ведёт обратно (X03): из открытых этим
  // человеком, с этим желанием.
  const snapshots = Object.values(db.externalWishlists);
  const openedAt = db.openedWishlists[me] ?? {};
  const snapshotOf = (ownerId: string, itemKey: string) =>
    snapshotForReservation(snapshots, { ownerId, itemKey, openedAt });
  const friendIds = new Set(db.friends[me] ?? []);
  const list: MyReservation[] = [];
  for (const reservation of db.reservations) {
    if (reservation.reserver.userId !== me) continue;
    const base = {
      id: reservation.id,
      itemKey: reservation.itemKey,
      closed: Boolean(reservation.closedAt),
      ...(reservation.closedAt ? { closedAt: reservation.closedAt } : {}),
      at: reservation.at,
    };
    const owner = db.users[reservation.ownerId];
    if (owner) {
      const item = (db.wishlistItems[owner.id] ?? []).find(
        (entry) => itemKeyOf(entry) === reservation.itemKey,
      );
      if (!item) continue;
      const occasion = occasionForOthers(db, owner.id, now);
      // Не друг (вкладки, «Локальная сеть») — бронь по ссылке: обратно к
      // ссылке, если её открывали, иначе — в профиль.
      const byLink = !friendIds.has(owner.id);
      const wishlistUrl = byLink
        ? snapshotOf(owner.id, reservation.itemKey)?.link
        : undefined;
      list.push({
        ...base,
        ...(byLink ? { byLink } : {}),
        ...(wishlistUrl ? { wishlistUrl } : {}),
        owner: {
          id: owner.id,
          name: owner.name ?? "",
          avatarColor: owner.avatarColor,
        },
        item:
          item.source.kind === "product"
            ? { productId: item.source.productId }
            : {
                custom: {
                  title: item.source.custom.title,
                  priceMin: item.source.custom.priceMin,
                  priceMax: item.source.custom.priceMax,
                  url: item.source.custom.url,
                },
              },
        ...(occasion ? { occasion } : {}),
      });
      continue;
    }
    const external = snapshotOf(reservation.ownerId, reservation.itemKey);
    const item = external?.items.find(
      (entry) => entry.key === reservation.itemKey,
    );
    if (!external || !item) continue;
    list.push({
      ...base,
      byLink: true,
      ...(external.link ? { wishlistUrl: external.link } : {}),
      owner: {
        id: reservation.ownerId,
        name: external.owner.name,
        avatarColor: external.owner.avatarColor,
      },
      item: item.productId
        ? { productId: item.productId }
        : item.custom
          ? { custom: item.custom }
          : {},
      ...(external.meta.occasion ? { occasion: external.meta.occasion } : {}),
    });
  }
  return visibleMyReservations(list, now);
};
