// Публичный API слоя данных: запросы по доменам, ключи, типы-контракты.
// Внутренности мок-сервера наружу не торчат — только ошибка API.

export { getCatalogCount, getFeed, getProduct } from "./catalog/requests";
export {
  type Activity,
  ActivitySchema,
  EMPTY_FILTERS,
  type FeedResponse,
  type Offer,
  type Product,
  type ProductFilters,
  ProductFiltersSchema,
  type ProductImage,
  ProductSchema,
  type VariantGroup,
  type VariantOption,
} from "./catalog/types";
export {
  getDemoSettings,
  getDemoUsers,
  resetDemo,
  updateDemoSettings,
} from "./demo/requests";
export {
  DEFAULT_DEMO_SETTINGS,
  type DemoSettings,
  DemoSettingsSchema,
} from "./demo/types";
// Боты режима local: запуск во вкладке-лидере и признак лидерства для
// демо-панели. Сам движок — внутри мок-сервера.
export {
  isBotLeader,
  startBrowserBots,
  subscribeBotLeader,
} from "./mock-server/adapters/browser/bots";
export { type ApiErrorCode, ApiError, isApiError } from "./mock-server/errors";
export { type ApiMode, detectMode } from "./mode";
export {
  answerPickRequest,
  createPickRequest,
  getMyPicks,
  importPickAnswer,
} from "./pick/requests";
export { type PickAnswer, type PickRequest } from "./pick/types";
export { type PlanSession } from "./plans/types";
export {
  catalogKeys,
  demoKeys,
  friendKeys,
  pickKeys,
  SCOPE_KEYS,
  reservationKeys,
  userKeys,
  wishlistKeys,
} from "./query-keys";
export { type SantaGame } from "./santa/types";
export {
  getTransport,
  type HttpMethod,
  setTransport,
  type Transport,
} from "./transport";
export {
  createUser,
  getFriends,
  getMe,
  getUser,
  loginDemoFn,
  updateMe,
} from "./users/requests";
export {
  type BotProfile,
  type FriendSummary,
  type NewUserInput,
  type UpdateMeInput,
  type User,
} from "./users/types";
export {
  createCustomWish,
  createSwipe,
  deleteWishlistItem,
  getMyWishlist,
  markWishlistItemGiven,
  reorderWishlist,
  restartSwipes,
  restoreWishlistItem,
  undeleteWishlistItem,
  undoSwipe,
  updateWishlistItem,
  dismissGivenHint,
  getUserWishlist,
  importExternalWishlist,
  shareWishlist,
  updateWishlistMeta,
} from "./wishlist/requests";
export {
  createReservation,
  deleteReservation,
  getReservations,
} from "./reservations/requests";
export {
  type CustomWish,
  type ExternalWishlist,
  type GuestWishlist,
  type Occasion,
  type ProductSwipe,
  type Reservation,
  type ReservationsView,
  type SwipeContext,
  type SwipeDecision,
  type SwipeResponse,
  type WishlistItem,
  type WishlistMeta,
  type WishlistResponse,
} from "./wishlist/types";
