import { getTransport } from "../transport";
import type {
  FriendSummary,
  HintId,
  MeResponse,
  NewUserInput,
  UpdateMeInput,
  User,
} from "./types";

export const loginDemoFn = (): Promise<MeResponse> =>
  getTransport().request<MeResponse>("POST", "/auth/demo");

// С этапа 7 — без тела: профиль без имени, со случайным фоном аватара
// (DESIGN §8.1). Поля input необязательные и нужны только старым экранам.
export const createUser = (input?: NewUserInput): Promise<MeResponse> =>
  getTransport().request<MeResponse>("POST", "/users", input);

export const getMe = (): Promise<MeResponse> =>
  getTransport().request<MeResponse>("GET", "/me");

export const updateMe = (patch: UpdateMeInput): Promise<MeResponse> =>
  getTransport().request<MeResponse>("PATCH", "/me", patch);

// Подсказка показана: обучающая карточка (deck_guide), тост «вкус сложился»
// (taste_toast). Ответ — обновлённый профиль.
export const markHintSeen = (id: HintId): Promise<MeResponse> =>
  getTransport().request<MeResponse>("POST", "/me/hints", { id });

export const getUser = (id: string): Promise<User> =>
  getTransport().request<User>("GET", `/users/${encodeURIComponent(id)}`);

export const getFriends = (): Promise<FriendSummary[]> =>
  getTransport().request<FriendSummary[]>("GET", "/friends");

// Кто сейчас онлайн в «Локальной сети» (только lan: маршрут LAN-сервера,
// TECH_SPEC §7a). Профили без имени в online не попадают.
export const getPresence = (): Promise<{
  devices: number;
  online: string[];
}> => getTransport().request("GET", "/presence");
