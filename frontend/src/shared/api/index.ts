// Публичный API слоя данных: запросы по доменам, ключи, типы-контракты.
// Внутренности мок-сервера наружу не торчат — только ошибка API.

export {
  getCatalogCount,
  getCatalogMeta,
  getFeed,
  getProduct,
} from "./catalog/requests";
export {
  type Activity,
  ActivitySchema,
  type CatalogMeta,
  EMPTY_FILTERS,
  type FeedResponse,
  type Offer,
  type PhotoCredit,
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
  loadNewYearScenario,
  resetDemo,
  updateDemoSettings,
} from "./demo/requests";
export {
  DEFAULT_DEMO_SETTINGS,
  type DemoSettings,
  DemoSettingsSchema,
  type NewYearScenarioResult,
} from "./demo/types";
// Боты режима local: запуск во вкладке-лидере и признак лидерства для
// демо-панели. Сам движок — внутри мок-сервера и грузится вместе с ним.
export {
  isBotLeader,
  startBrowserBots,
  subscribeBotLeader,
} from "./browser-bots";
export { type ApiErrorCode, ApiError, isApiError } from "./mock-server/errors";
export { httpTransport } from "./http-transport";
export {
  type ApiMode,
  apiUrl,
  detectEnvironment,
  detectMode,
  type Environment,
  getMode,
} from "./mode";
export {
  answerPickRequest,
  createPickRequest,
  getMyPicks,
  importPickAnswer,
} from "./pick/requests";
export { type PickAnswer, type PickRequest } from "./pick/types";
export {
  computeMatches,
  decisionCandidates,
  type DecisionCandidates,
  type PlanMatch,
  type PlanMatches,
  tallyVotes,
  voteCandidates,
  type VoteTally,
} from "./plans/matches";
export {
  addPlanActivities,
  cancelPlanDecision,
  createCustomActivity,
  createPlan,
  decidePlan,
  expirePlans,
  finishPlan,
  getActivities,
  getPlan,
  getPlans,
  joinPlan,
  setPlanReady,
  setPlanRule,
  startPlan,
  swipePlan,
  undoPlanSwipe,
  votePlan,
} from "./plans/requests";
export {
  type CreatePlanInput,
  CreatePlanInputSchema,
  type CustomActivityInput,
  CustomActivityInputSchema,
  type DecidePlanInput,
  type PlanFilters,
  PlanFiltersSchema,
  type PlanParticipant,
  type PlanSession,
  type PlanSummary,
  type PlanView,
} from "./plans/types";
export {
  activityKeys,
  catalogKeys,
  demoKeys,
  friendKeys,
  pickKeys,
  planKeys,
  SCOPE_KEYS,
  reservationKeys,
  santaKeys,
  userKeys,
  wishlistKeys,
} from "./query-keys";
export {
  drawAssignments,
  drawIssueOf,
  MIN_SANTA_PARTICIPANTS,
} from "./santa/draw";
export {
  createSantaGame,
  drawSantaGame,
  getSantaGame,
  getSantaGames,
  joinSantaGame,
  openSantaEnvelope,
  setSantaBought,
  tickSanta,
  updateSantaGame,
} from "./santa/requests";
export {
  type CreateSantaInput,
  CreateSantaInputSchema,
  type SantaEnvelopeState,
  type SantaGame,
  type SantaGamePublic,
  type SantaMe,
  type SantaMember,
  type SantaSummary,
  type SantaTickResult,
  type SantaView,
  type SantaWard,
  type SantaWardItem,
  type UpdateSantaInput,
  UpdateSantaInputSchema,
} from "./santa/types";
export {
  getTransport,
  type HttpMethod,
  setTransport,
  type Transport,
} from "./transport";
export {
  createUser,
  getFriends,
  getPresence,
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
