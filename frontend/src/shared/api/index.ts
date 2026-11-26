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
  resetDemo,
  updateDemoSettings,
} from "./demo/requests";
export {
  DEFAULT_DEMO_SETTINGS,
  type DemoSettings,
  DemoSettingsSchema,
} from "./demo/types";
export { type ApiErrorCode, ApiError, isApiError } from "./mock-server/errors";
export { type ApiMode, detectMode } from "./mode";
export { type PickAnswer, type PickRequest } from "./pick/types";
export { type PlanSession } from "./plans/types";
export {
  catalogKeys,
  demoKeys,
  friendKeys,
  SCOPE_KEYS,
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
  createSwipe,
  getMyWishlist,
  restartSwipes,
  undoSwipe,
} from "./wishlist/requests";
export {
  type CustomWish,
  type ExternalWishlist,
  type Occasion,
  type ProductSwipe,
  type Reservation,
  type SwipeContext,
  type SwipeDecision,
  type SwipeResponse,
  type WishlistItem,
  type WishlistMeta,
  type WishlistResponse,
} from "./wishlist/types";
