// Справочники каталога (TECH_SPEC §5, бриф Товароведа §3–4). Массивы id —
// источник и для TS-типов, и для zod-схем: перечисления не расходятся.

export const MARKETPLACE_IDS = [
  "wildberries",
  "ozon",
  "aliexpress",
  "pinduoduo",
  "temu",
  "amazon",
  "yandex_market",
  "other",
] as const;
export type MarketplaceId = (typeof MARKETPLACE_IDS)[number];

// Только названия текстом, без логотипов (DESIGN.md §7 Chip).
export const MARKETPLACE_LABELS: Record<MarketplaceId, string> = {
  wildberries: "Wildberries",
  ozon: "Ozon",
  aliexpress: "AliExpress",
  pinduoduo: "Pinduoduo",
  temu: "Temu",
  amazon: "Amazon",
  yandex_market: "Яндекс Маркет",
  other: "Другой магазин",
};

export const CATEGORY_IDS = [
  "tech",
  "beauty",
  "home",
  "kitchen",
  "sport",
  "outdoor",
  "books",
  "hobby",
  "fashion",
  "jewelry",
  "games",
  "kids",
  "auto",
  "pets",
  "experiences",
] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];

// Короткие подписи для чипов фильтра (полные названия — в брифе Товароведа).
export const CATEGORY_LABELS: Record<CategoryId, string> = {
  tech: "Техника",
  beauty: "Красота",
  home: "Дом и уют",
  kitchen: "Кухня",
  sport: "Спорт",
  outdoor: "Горы и походы",
  books: "Книги",
  hobby: "Хобби",
  fashion: "Одежда",
  jewelry: "Украшения",
  games: "Игры",
  kids: "Детям",
  auto: "Для авто",
  pets: "Питомцам",
  experiences: "Впечатления",
};

// 20 интересов онбординга (бриф Товароведа §3). Порядок — как в облаке чипов.
export const INTEREST_IDS = [
  "coffee",
  "cooking",
  "gadgets",
  "gaming",
  "boardgames",
  "music",
  "reading",
  "art",
  "photo",
  "fitness",
  "mountains",
  "travel",
  "beauty",
  "fashion",
  "home",
  "plants",
  "pets",
  "cars",
  "wellness",
  "anime",
] as const;
export type InterestId = (typeof INTEREST_IDS)[number];

export const INTEREST_LABELS: Record<InterestId, string> = {
  coffee: "Кофе и чай",
  cooking: "Готовить",
  gadgets: "Гаджеты",
  gaming: "Видеоигры",
  boardgames: "Настолки",
  music: "Музыка",
  reading: "Книги",
  art: "Рисование и творчество",
  photo: "Фото и видео",
  fitness: "Спорт и фитнес",
  mountains: "Горы и походы",
  travel: "Путешествия",
  beauty: "Уход и косметика",
  fashion: "Мода",
  home: "Уют дома",
  plants: "Растения",
  pets: "Животные",
  cars: "Авто",
  wellness: "Сон и здоровье",
  anime: "Аниме и комиксы",
};

export const AUDIENCES = ["all", "female", "male"] as const;
export type Audience = (typeof AUDIENCES)[number];

// «Показывать подарки: всем / для неё / для него» (DESIGN.md §8.1).
export const AUDIENCE_LABELS: Record<Audience, string> = {
  all: "всем",
  female: "для неё",
  male: "для него",
};

export const ACTIVITY_CATEGORY_IDS = [
  "active",
  "chill",
  "food",
  "culture",
  "nature",
  "party",
  "selfcare",
] as const;
export type ActivityCategoryId = (typeof ACTIVITY_CATEGORY_IDS)[number];

export const ACTIVITY_CATEGORY_LABELS: Record<ActivityCategoryId, string> = {
  active: "Активное",
  chill: "Спокойно",
  food: "Поесть",
  culture: "Культура",
  nature: "Природа",
  party: "Повеселиться",
  selfcare: "Отдохнуть телом",
};

export const ACTIVITY_TAG_IDS = [
  "outdoor",
  "indoor",
  "kids_ok",
  "evening",
  "weekend",
  "cheap",
  "date",
  "big_group",
] as const;
export type ActivityTagId = (typeof ACTIVITY_TAG_IDS)[number];

export const ACTIVITY_TAG_LABELS: Record<ActivityTagId, string> = {
  outdoor: "на улице",
  indoor: "в помещении",
  kids_ok: "можно с детьми",
  evening: "вечером",
  weekend: "на выходные",
  cheap: "недорого",
  date: "для свидания",
  big_group: "большой компанией",
};

export const SEASONS = ["winter", "spring", "summer", "autumn"] as const;
export type Season = (typeof SEASONS)[number];

// Обучающая карточка (DESIGN.md §7 DeckGuide, TECH_SPEC §6 «Алгоритм ленты»,
// п. 2): всегда этот товар, пока подсказка deck_guide не отмечена. Один и тот
// же — поэтому его обложку можно грузить прямо из HTML, до JS.
export const GUIDE_PRODUCT_ID = "p_0049";
