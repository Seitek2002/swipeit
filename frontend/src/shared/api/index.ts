// Публичный API слоя данных: запросы по доменам, ключи, типы-контракты.
// Внутренности мок-сервера наружу не торчат — только ошибка API.

export {
  getCatalogCount,
  getCatalogMeta,
  getCatalogStores,
  getFeed,
  getProduct,
} from "./catalog/requests";
export {
  type Activity,
  ActivitySchema,
  type CatalogMeta,
  type CatalogStores,
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
export { EMPTY_FILTERS } from "./catalog/constants";
export {
  getDemoSettings,
  getDemoUsers,
  jumpToReminder,
  loadNewYearScenario,
  resetDemo,
  resetDemoHints,
  updateDemoSettings,
} from "./demo/requests";
export {
  type DemoSettings,
  DemoSettingsSchema,
  type NewYearScenarioResult,
} from "./demo/types";
export { DEFAULT_DEMO_SETTINGS } from "./demo/constants";
// Боты режима local: запуск во вкладке-лидере и признак лидерства для
// демо-панели. Сам движок — внутри мок-сервера и грузится вместе с ним.
export {
  isBotLeader,
  startBrowserBots,
  subscribeBotLeader,
} from "./browser-bots";
export {
  type ApiErrorCode,
  ApiError,
  isApiError,
  isNameRequired,
} from "./mock-server/errors";
export { httpTransport } from "./http-transport";
// Приглашения в план и игру короткой ссылкой (remote, BACKEND.md §6.2).
export { createInviteLink, getShareTarget } from "./invites/requests";
export {
  type InviteKind,
  type InviteLink,
  type ShareTarget,
} from "./invites/types";
export {
  getRemoteApiBase,
  isRemoteBuild,
  remoteApiUrl,
  remoteWsUrl,
} from "./remote-base";
export { remoteTransport } from "./remote-transport";
// Номер сборки и «Обнови приложение» (B17, B15).
export { CLIENT_BUILD, isClientOutdated } from "./client-build";
// Фото своих желаний через сервер (remote, B15).
export { remoteImageUrl, uploadRemoteImage } from "./remote-uploads";
// Экраны по короткой ссылке ?s= (remote, B15): вишлист и «Выбери подарок сам».
export { getShare } from "./share/requests";
export { type ShareView } from "./share/types";
export { warmLocalApi } from "./warmup";
export {
  type ApiMode,
  apiUrl,
  detectEnvironment,
  detectMode,
  type Environment,
  getMode,
  type RemoteInfo,
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
  countedParticipants,
  decisionCandidates,
  type DecisionCandidates,
  type PlanMatch,
  type PlanMatches,
  tallyVotes,
  voteCandidates,
  type VoteTally,
} from "./plans/matches";
export { plannedDeckSize, QUICK_DECK_SIZE } from "./plans/deck";
export {
  closePlan,
  leavePlan,
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
  inviteKeys,
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
  leaveSantaGame,
  removeSantaMember,
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
  createMyDate,
  createUser,
  deleteMe,
  deleteMyDate,
  dismissReminder,
  getMyDates,
  getMyReminders,
  updateMyDate,
  getFriends,
  getPresence,
  getMe,
  getUser,
  loginDemoFn,
  logout,
  markHintSeen,
  updateMe,
} from "./users/requests";
export {
  type BotProfile,
  type CreateDateInput,
  type FriendSummary,
  type ImportantDate,
  type ImportantDatePreset,
  type ImportantDateView,
  type Reminder,
  type UpdateDateInput,
  HINT_IDS,
  type HintId,
  type MeResponse,
  type NamedUser,
  type NewUserInput,
  type Taste,
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
  getOpenedWishlists,
  getUserWishlist,
  importExternalWishlist,
  shareWishlist,
  updateWishlistMeta,
} from "./wishlist/requests";
export {
  createReservation,
  deleteReservation,
  getMyReservations,
  getReservations,
} from "./reservations/requests";
export {
  type CustomWish,
  type ExternalWishlist,
  type GuestWishlist,
  type Occasion,
  type ProductSwipe,
  type Reservation,
  type MyReservation,
  type OpenedWishlist,
  type ReservationsView,
  type SwipeContext,
  type SwipeDecision,
  type SwipeResponse,
  type WishlistItem,
  type WishlistMeta,
  type WishlistResponse,
} from "./wishlist/types";
