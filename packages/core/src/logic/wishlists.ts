import type {
  Occasion,
  Wishlist,
  WishlistCover,
  WishlistItem,
} from "../api/wishlist/types";
import type { OccasionKind } from "../config/occasions";
import { ApiError, forbidden, notFound, validation } from "../errors";

// Несколько вишлистов, как плейлисты (spec-multi-wishlists §2): правила без
// базы — общие для мока, LAN-сервера и backend. Человек начинает с одного
// «Общего», остальные создаёт сам; один вишлист главный — туда летят «Хочу».
// Желание можно переместить (та же строка) или скопировать (новая строка с
// тем же ключом брони).

export const DEFAULT_WISHLIST_NAME = "Общий";
// Решение владельца В5: случаев в году меньше; поднять — эта константа.
export const MAX_WISHLISTS = 10;
export const WISHLIST_NAME_MAX = 40;
// Сколько фото в обложке вишлиста (мозаика в ряду и в шторках выбора).
export const WISHLIST_COVER_SIZE = 4;

// Тексты ошибок (DESIGN §9, spec §4.10) — одни у мока и сервера.
export const WISHLIST_ERRORS = {
  deleted: "Этот вишлист удалили",
  empty: "В этом вишлисте пока пусто",
  featureOff: "Несколько вишлистов пока недоступны",
  keepDefault: "„Общий“ удалить нельзя",
  limit: `Можно до ${MAX_WISHLISTS} вишлистов`,
  nameTaken: "Вишлист с таким названием уже есть",
  notFound: "Вишлист не найден",
} as const;

// Чужой или несуществующий вишлист — как с чужим желанием (§3.2).
export const wishlistNotFound = () => notFound(WISHLIST_ERRORS.notFound);

// GET /share/:code закрытой ссылки удалённого вишлиста (§5.2).
export const wishlistDeleted = () =>
  new ApiError(
    404,
    "NOT_FOUND",
    WISHLIST_ERRORS.deleted,
    undefined,
    "WISHLIST_DELETED",
  );

// Флаг выключен (FEATURE_MULTI_WISHLISTS): у человека только «Общий», второй
// не создаём. В интерфейсе создания тогда нет — сюда попадает только прямой
// запрос.
export const multiWishlistsOff = () =>
  new ApiError(
    403,
    "FORBIDDEN",
    WISHLIST_ERRORS.featureOff,
    undefined,
    "MULTI_WISHLISTS_OFF",
  );

// ── Ключ брони и повторы ────────────────────────────────────────────────

type KeyedItem = Pick<WishlistItem, "id" | "originId" | "source">;
type KeyedActiveItem = KeyedItem & Pick<WishlistItem, "status">;

// itemKey брони (TECH_SPEC §5 Reservation, spec §2.4): у товара — productId,
// у своего желания — "custom:<id исходного желания>". Копия своего желания
// несёт originId, поэтому один подарок в двух вишлистах — одна бронь. У
// старых данных originId нет — ключ прежний.
export const itemKeyOf = (item: KeyedItem): string =>
  item.source.kind === "product"
    ? item.source.productId
    : `custom:${item.originId ?? item.id}`;

// Ключи активных («Хочу») желаний: по ним гость ссылки видит и бронирует
// только своё (§3.5), а владелец — счётчик броней открытого вишлиста.
export const activeKeysOf = (items: readonly KeyedActiveItem[]): Set<string> =>
  new Set(
    items
      .filter((item) => item.status === "active")
      .map((item) => itemKeyOf(item)),
  );

// Разных подарков в «Хочу» во всех вишлистах человека (§2.8): копия не
// накручивает порог «5 желаний» и бейдж таба.
export const distinctWishCount = (items: readonly KeyedActiveItem[]): number =>
  activeKeysOf(items).size;

// «2 подарка уже кто-то выбрал» — занятые ключи среди активных желаний
// открытого вишлиста (§2.8). reservedKeys — ключи открытых броней владельца.
export const reservedCountIn = (
  items: readonly KeyedActiveItem[],
  reservedKeys: ReadonlySet<string>,
): number =>
  [...activeKeysOf(items)].filter((key) => reservedKeys.has(key)).length;

// Вишлист строки. У старых данных мока поля нет — строка в «Общем» (§3.6).
export const listIdOf = (
  item: Pick<WishlistItem, "wishlistId">,
  defaultId: string,
): string => item.wishlistId ?? defaultId;

// Строки этого вишлиста из всех желаний человека.
export const itemsInList = <T extends Pick<WishlistItem, "wishlistId">>(
  items: readonly T[],
  listId: string,
  defaultId: string,
): T[] => items.filter((item) => listIdOf(item, defaultId) === listId);

// Двойник в том же вишлисте (§2.4): один подарок живёт в вишлисте один раз —
// среди активных строк, по ключу брони. Сама строка (exceptId) не в счёт.
export const findTwin = <T extends KeyedActiveItem>(
  listItems: readonly T[],
  key: string,
  exceptId?: string,
): T | undefined =>
  listItems.find(
    (item) =>
      item.status === "active" &&
      item.id !== exceptId &&
      itemKeyOf(item) === key,
  );

// Все активные копии подарка во всех вишлистах: «Мне это подарили» на одной
// строке отмечает подаренными их все (решение владельца В3, §2.5).
export const activeCopiesOf = <T extends KeyedActiveItem>(
  items: readonly T[],
  key: string,
): T[] =>
  items.filter((item) => item.status === "active" && itemKeyOf(item) === key);

// ── Копия и перемещение ─────────────────────────────────────────────────

// Копия — новая независимая строка (§2.4): товар или своё желание, вариант,
// заметка и «Очень хочу» скопированы; статус active. У своего желания —
// originId исходного, чтобы бронь была одна.
export const copyItem = (
  item: WishlistItem,
  to: { addedAt: string; id: string; order: number; wishlistId: string },
): WishlistItem => {
  const copy: WishlistItem = {
    id: to.id,
    ownerId: item.ownerId,
    source:
      item.source.kind === "product"
        ? { kind: "product", productId: item.source.productId }
        : { kind: "custom", custom: { ...item.source.custom } },
    priority: item.priority,
    order: to.order,
    status: "active",
    wishlistId: to.wishlistId,
    addedAt: to.addedAt,
  };
  if (item.source.kind === "custom") copy.originId = item.originId ?? item.id;
  if (item.variantChoice) copy.variantChoice = { ...item.variantChoice };
  if (item.note) copy.note = item.note;
  return copy;
};

const hasChoice = (choice: WishlistItem["variantChoice"]) =>
  Boolean(choice && Object.keys(choice).length > 0);

// Перемещение туда, где подарок уже есть, — слияние (§2.4): остаётся строка
// цели; «Очень хочу», если оно было хоть у одной; заметка и вариант — у
// цели, а если там пусто, то от перемещаемой. Перемещаемую строку обработчик
// удаляет.
export const mergeOnMove = (
  target: WishlistItem,
  moving: WishlistItem,
): WishlistItem => {
  const merged: WishlistItem = {
    ...target,
    priority:
      target.priority === "top" || moving.priority === "top" ? "top" : "normal",
  };
  if (!target.note?.trim() && moving.note?.trim()) merged.note = moving.note;
  if (!hasChoice(target.variantChoice) && hasChoice(moving.variantChoice)) {
    merged.variantChoice = { ...moving.variantChoice };
  }
  return merged;
};

// Что сделать с POST /wishlist/items/:id/move: желание уже здесь — ничего;
// в цели есть активный двойник — слить в него; иначе — переложить строку
// наверх цели. targetItems — строки вишлиста-цели.
export type MovePlan<T> =
  { kind: "merge"; target: T } | { kind: "move" } | { kind: "stay" };

export const planMove = <T extends KeyedActiveItem>(
  moving: KeyedActiveItem & Pick<WishlistItem, "wishlistId">,
  targetListId: string,
  targetItems: readonly T[],
  defaultId: string,
): MovePlan<T> => {
  if (listIdOf(moving, defaultId) === targetListId) return { kind: "stay" };
  // Подаренное двойников не ищет: уникальность — среди активных.
  if (moving.status !== "active") return { kind: "move" };
  const twin = findTwin(targetItems, itemKeyOf(moving), moving.id);
  return twin ? { kind: "merge", target: twin } : { kind: "move" };
};

// Что сделать с POST /wishlist/items/:id/copy: подарок в цели уже есть —
// ничего не меняем, ответ { item: двойник, alreadyThere: true }.
export type CopyPlan<T> =
  { existing: T; kind: "alreadyThere" } | { kind: "copy" };

export const planCopy = <T extends KeyedActiveItem>(
  item: KeyedItem,
  targetItems: readonly T[],
): CopyPlan<T> => {
  const existing = findTwin(targetItems, itemKeyOf(item));
  return existing ? { kind: "alreadyThere", existing } : { kind: "copy" };
};

// Удаление вишлиста (§2.7, решение В2): все его желания — и активные, и
// подаренные — переезжают в «Общий», наверх, в прежнем порядке; активный
// двойник в «Общем» — слияние (mergeOnMove). moves — id строк, которые
// перекладываем (сверху вниз), merges — какие строки слить и в какую.
export const planListDeletion = <
  T extends KeyedActiveItem & Pick<WishlistItem, "order">,
>(
  deletedItems: readonly T[],
  defaultItems: readonly T[],
): {
  merges: Array<{ movingId: string; targetId: string }>;
  moves: string[];
} => {
  const moves: string[] = [];
  const merges: Array<{ movingId: string; targetId: string }> = [];
  const sorted = [...deletedItems].sort((a, b) => a.order - b.order);
  for (const item of sorted) {
    const twin =
      item.status === "active"
        ? findTwin(defaultItems, itemKeyOf(item), item.id)
        : undefined;
    if (twin) merges.push({ movingId: item.id, targetId: twin.id });
    else moves.push(item.id);
  }
  return { merges, moves };
};

// Номера для строк, которые встают наверх вишлиста, сохраняя свой порядок:
// count штук над самым верхним (новые первыми, как nextOrder мока).
export const ordersOnTop = (
  listOrders: readonly number[],
  count: number,
): number[] => {
  const top = Math.min(1, ...listOrders) - 1;
  return Array.from({ length: count }, (_, index) => top - (count - 1 - index));
};

// ── Вишлисты человека ───────────────────────────────────────────────────

type NamedList = Pick<Wishlist, "id" | "isDefault" | "name">;

const nameKey = (name: string) => name.trim().toLocaleLowerCase("ru");

// Названия совпадают без учёта регистра и пробелов по краям — как
// уникальный индекс wishlists(owner_id, lower(name)) на сервере.
export const sameWishlistName = (a: string, b: string): boolean =>
  nameKey(a) === nameKey(b);

export const findNameClash = <T extends NamedList>(
  lists: readonly T[],
  name: string,
  exceptId?: string,
): T | undefined =>
  lists.find(
    (list) => list.id !== exceptId && sameWishlistName(list.name, name),
  );

// Сколько вишлистов можно держать: с выключенным флагом — только «Общий».
export const maxWishlists = (enabled: boolean): number =>
  enabled ? MAX_WISHLISTS : 1;

// POST /wishlists: флаг, лимит, повтор названия. name — уже после
// WishlistNameSchema (trim, 1–40).
export const assertCanCreateWishlist = (
  lists: readonly NamedList[],
  name: string,
  { enabled }: { enabled: boolean },
): void => {
  if (lists.length >= maxWishlists(enabled)) {
    throw enabled ? validation(WISHLIST_ERRORS.limit) : multiWishlistsOff();
  }
  if (findNameClash(lists, name)) throw validation(WISHLIST_ERRORS.nameTaken);
};

// PATCH /wishlists/:id: своё старое название (в другом регистре) — можно.
export const assertCanRenameWishlist = (
  lists: readonly NamedList[],
  id: string,
  name: string,
): void => {
  if (findNameClash(lists, name, id)) {
    throw validation(WISHLIST_ERRORS.nameTaken);
  }
};

// DELETE /wishlists/:id: «Общий» — запасной для главного, старых ссылок,
// Санты и желаний удалённых вишлистов (§2.2).
export const assertCanDeleteWishlist = (list: NamedList): void => {
  if (list.isDefault) throw forbidden(WISHLIST_ERRORS.keepDefault);
};

// POST /wishlist/share: отправка открыта (порог — по человеку) и в этом
// вишлисте есть хоть одно активное желание (§2.8).
export const assertCanShareWishlist = (activeInList: number): void => {
  if (activeInList < 1) throw validation(WISHLIST_ERRORS.empty);
};

export const defaultWishlistOf = <T extends Pick<Wishlist, "isDefault">>(
  lists: readonly T[],
): T | undefined => lists.find((list) => list.isDefault);

// Свой вишлист по id из запроса; чужой или удалённый — NOT_FOUND.
export const findOwnWishlist = <T extends Pick<Wishlist, "id">>(
  lists: readonly T[],
  id: string,
): T => {
  const list = lists.find((entry) => entry.id === id);
  if (!list) throw wishlistNotFound();
  return list;
};

// Главный (§2.3): сохранённый, если он ещё есть; пусто или вишлист удалён —
// «Общий». Нет вишлистов вовсе — undefined (профиль без «Общего» лечит
// ensureDefaultList).
export const resolveActiveWishlistId = (
  lists: readonly Pick<Wishlist, "id" | "isDefault">[],
  activeId: string | undefined,
): string | undefined => {
  if (activeId && lists.some((list) => list.id === activeId)) return activeId;
  return (defaultWishlistOf(lists) ?? lists[0])?.id;
};

// Вишлист запроса: явный (свой, иначе NOT_FOUND) или главный.
export const resolveWishlist = <T extends Pick<Wishlist, "id" | "isDefault">>(
  lists: readonly T[],
  id: string | undefined,
  activeId: string | undefined,
): T => {
  if (id) return findOwnWishlist(lists, id);
  const resolved = resolveActiveWishlistId(lists, activeId);
  const list = lists.find((entry) => entry.id === resolved);
  if (!list) throw wishlistNotFound();
  return list;
};

// Ряд вишлистов (§2.1): «Общий» первым, дальше по созданию.
export const sortWishlists = <
  T extends Pick<Wishlist, "createdAt" | "isDefault">,
>(
  lists: readonly T[],
): T[] =>
  lists
    .map((list, index) => ({ index, list }))
    .sort(
      (a, b) =>
        Number(b.list.isDefault) - Number(a.list.isDefault) ||
        a.list.createdAt.localeCompare(b.list.createdAt) ||
        a.index - b.index,
    )
    .map(({ list }) => list);

type DatedList = Pick<Wishlist, "createdAt" | "id" | "isDefault" | "name"> & {
  occasion?: Pick<Occasion, "date" | "kind">;
};

// Самый новый из подходящих; при равном createdAt — что позже в списке.
const newest = <T extends Pick<Wishlist, "createdAt">>(
  lists: readonly T[],
): T | undefined =>
  lists.reduce<T | undefined>(
    (best, list) => (!best || list.createdAt >= best.createdAt ? list : best),
    undefined,
  );

// Вишлист с этим поводом (самый новый): баннер даты (§4.6), карточка «Через
// 5 дней у Нурай» ведёт на вишлист к дню рождения (§2.10).
export const findOccasionWishlist = <T extends DatedList>(
  lists: readonly T[],
  kind: OccasionKind,
): T | undefined =>
  newest(lists.filter((list) => list.occasion?.kind === kind));

// Вишлист для Тайного Санты по умолчанию (§2.9): с поводом «Новый год»;
// иначе с названием «Новый год»; иначе «Общий». Из нескольких подходящих —
// самый новый.
export const pickSantaWishlist = <T extends DatedList>(
  lists: readonly T[],
): T | undefined =>
  findOccasionWishlist(lists, "new_year") ??
  newest(lists.filter((list) => sameWishlistName(list.name, "Новый год"))) ??
  defaultWishlistOf(lists) ??
  lists[0];

// Какой вишлист друга открыть первым (§2.10): с ближайшей датой повода
// (сегодня и позже); без дат — «Общий»; нет и его среди непустых — первый.
// today — "YYYY-MM-DD" в поясе человека.
export const pickFriendWishlist = <
  T extends Omit<DatedList, "createdAt" | "name">,
>(
  lists: readonly T[],
  today: string,
): T | undefined => {
  let nearest: T | undefined;
  for (const list of lists) {
    const date = list.occasion?.date;
    if (!date || date < today) continue;
    if (!nearest || date < (nearest.occasion?.date ?? "")) nearest = list;
  }
  return nearest ?? defaultWishlistOf(lists) ?? lists[0];
};

// ── Что видит гость ─────────────────────────────────────────────────────

// Название показываем гостю, в превью и на открытке, если это не
// непереименованный «Общий» (§2.2, §4.7): «Вишлист Даны», а не «Вишлист
// Даны — Общий».
export const showListName = (list: Pick<Wishlist, "isDefault" | "name">) =>
  !(list.isDefault && list.name === DEFAULT_WISHLIST_NAME);

// Название для гостя или undefined (ExternalWishlist.meta.listName, «l»
// ссылки-снимка).
export const guestListName = (
  list: Pick<Wishlist, "isDefault" | "name">,
): string | undefined => (showListName(list) ? list.name : undefined);

// «Вишлист Даны — День рождения» (og:title, «Открывал по ссылке»); у
// «Общего» — просто «Вишлист Даны». Название не склоняем (DESIGN §8.4).
export const withListName = (
  title: string,
  list: Pick<Wishlist, "isDefault" | "name">,
): string => (showListName(list) ? `${title} — ${list.name}` : title);

// ── Ряд вишлистов ───────────────────────────────────────────────────────

type CoverItem = Pick<WishlistItem, "order" | "source" | "status">;

// Обложка (§2.1): до 4 фото активных желаний сверху списка. Своё желание
// без фото в обложку не попадает — там пустая бирка.
export const wishlistCover = (
  listItems: readonly CoverItem[],
): WishlistCover[] =>
  [...listItems]
    .filter((item) => item.status === "active")
    .sort((a, b) => a.order - b.order)
    .flatMap((item): WishlistCover[] => {
      if (item.source.kind === "product") {
        return [{ productId: item.source.productId }];
      }
      const { imageKey } = item.source.custom;
      return imageKey ? [{ imageKey }] : [];
    })
    .slice(0, WISHLIST_COVER_SIZE);

// Счётчики строки ряда: «Хочу» и «Подарили» этого вишлиста.
export const wishlistCounts = (
  listItems: readonly Pick<WishlistItem, "status">[],
): { activeCount: number; givenCount: number } => ({
  activeCount: listItems.filter((item) => item.status === "active").length,
  givenCount: listItems.filter((item) => item.status === "given").length,
});
