import { getTransport } from "../transport";
import type {
  CreateSantaInput,
  SantaSummary,
  SantaTickResult,
  SantaView,
  UpdateSantaInput,
} from "./types";

const gamePath = (id: string) => `/santa/${encodeURIComponent(id)}`;

// Мои игры: участвую или позван.
export const getSantaGames = (): Promise<SantaSummary[]> =>
  getTransport().request<SantaSummary[]>("GET", "/santa");

// Игра глазами текущего пользователя: свой подопечный — только участнику
// и только после жеребьёвки.
export const getSantaGame = (id: string): Promise<SantaView> =>
  getTransport().request<SantaView>("GET", gamePath(id));

export const createSantaGame = (input: CreateSantaInput): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", "/santa", input);

// Только организатор и только до жеребьёвки.
export const updateSantaGame = (
  id: string,
  patch: UpdateSantaInput,
): Promise<SantaView> =>
  getTransport().request<SantaView>("PATCH", gamePath(id), patch);

export const joinSantaGame = (id: string): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", `${gamePath(id)}/join`);

// «Провести жеребьёвку» — только организатор. Невозможные исключения или
// меньше 3 участников — ApiError CONFLICT с текстом для экрана.
export const drawSantaGame = (id: string): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", `${gamePath(id)}/draw`);

export const openSantaEnvelope = (id: string): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", `${gamePath(id)}/open`);

// «Выйти из игры» — до жеребьёвки, не организатор (Q05).
export const leaveSantaGame = (id: string): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", `${gamePath(id)}/leave`);

// «Убрать из игры» — организатор, до жеребьёвки (Q05).
export const removeSantaMember = (
  id: string,
  userId: string,
): Promise<SantaView> =>
  getTransport().request<SantaView>(
    "DELETE",
    `${gamePath(id)}/members/${encodeURIComponent(userId)}`,
  );

// «Я купил подарок» (bought: false — снять отметку).
// itemKey — что купил (X02): желание подопечного бронируется.
export const setSantaBought = (
  id: string,
  bought = true,
  itemKey?: string,
): Promise<SantaView> =>
  getTransport().request<SantaView>("POST", `${gamePath(id)}/bought`, {
    bought,
    ...(itemKey ? { itemKey } : {}),
  });

// Жеребьёвка по дате: планировщик зовёт раз в 15 с и при возвращении во
// вкладку, вместе с expirePlans.
export const tickSanta = (): Promise<SantaTickResult> =>
  getTransport().request<SantaTickResult>("POST", "/santa/tick");
