import { setRemoteToken } from "@/shared/store";

import { getTransport } from "../transport";
import type {
  CreateDateInput,
  FriendSummary,
  HintId,
  ImportantDateView,
  MeResponse,
  NewUserInput,
  Reminder,
  UpdateDateInput,
  UpdateMeInput,
  User,
} from "./types";

export const loginDemoFn = (): Promise<MeResponse> =>
  getTransport().request<MeResponse>("POST", "/auth/demo");

// С этапа 7 — без тела: профиль без имени, со случайным фоном аватара
// (DESIGN §8.1). Поля input необязательные и нужны только старым экранам.
//
// Сервер (remote) отвечает { me, token } (BACKEND.md §3.1): токен сессии
// сохраняем сразу, до первого запроса с ним. Мок и LAN отдают профиль как есть.
export const createUser = async (input?: NewUserInput): Promise<MeResponse> => {
  const result = await getTransport().request<
    { me: MeResponse; token: string } | MeResponse
  >("POST", "/users", input);
  if (!("token" in result)) return result;
  setRemoteToken(result.token);
  return result.me;
};

// Только remote (§3.4): «Выйти» закрывает сессию этого устройства,
// «Удалить профиль» удаляет человека и его данные.
export const logout = (): Promise<{ ok: true }> =>
  getTransport().request("POST", "/auth/logout");

export const deleteMe = (): Promise<{ ok: true }> =>
  getTransport().request("DELETE", "/me");

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

// ── «Мои даты» и напоминания (только свои: id — из сессии) ─────────────

export const getMyDates = (): Promise<ImportantDateView[]> =>
  getTransport().request<ImportantDateView[]>("GET", "/me/dates");

// Такая дата уже есть — вернётся она же, без дубля.
export const createMyDate = (
  input: CreateDateInput,
): Promise<ImportantDateView> =>
  getTransport().request<ImportantDateView>("POST", "/me/dates", input);

// label: "" или null — вернуть подпись готового повода или «Значимая дата N».
export const updateMyDate = (
  id: string,
  patch: UpdateDateInput,
): Promise<ImportantDateView> =>
  getTransport().request<ImportantDateView>(
    "PATCH",
    `/me/dates/${encodeURIComponent(id)}`,
    patch,
  );

// В ответе — удалённая дата (для «Отменить»: createMyDate с её date,
// preset, label и autoNumber) и сбросился ли повод вишлиста на «Просто так».
export const deleteMyDate = (
  id: string,
): Promise<{ date: ImportantDateView; occasionReset: boolean; ok: true }> =>
  getTransport().request("DELETE", `/me/dates/${encodeURIComponent(id)}`);

// Активное напоминание: 0 или 1.
export const getMyReminders = (): Promise<Reminder[]> =>
  getTransport().request<Reminder[]>("GET", "/me/reminders");

// «Скрыть» — до следующего года. Ответ — напоминания после скрытия.
export const dismissReminder = (id: string): Promise<Reminder[]> =>
  getTransport().request<Reminder[]>(
    "POST",
    `/me/reminders/${encodeURIComponent(id)}/dismiss`,
  );
