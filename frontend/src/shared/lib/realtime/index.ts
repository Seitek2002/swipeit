import { createLocalRealtime } from "./local";
import type { Realtime } from "./types";

export {
  type ConnectionStatus,
  getConnectionStatus,
  subscribeConnection,
  useConnectionStatus,
} from "./connection";
export {
  createRemoteRealtime,
  createWsRealtime,
  type RemoteRealtime,
  type WsRealtime,
} from "./ws";
export {
  ALL_SCOPES,
  type Realtime,
  type RealtimeEvent,
  type RealtimeScope,
} from "./types";

// Одна шина на вкладку. Интерфейс специально такой, чтобы в режимах lan и
// remote подменить реализацию на WebSocket, не трогая компоненты.
let instance: null | Realtime = null;

export const getRealtime = (): Realtime => {
  instance ??= createLocalRealtime();
  return instance;
};

export const setRealtime = (realtime: Realtime) => {
  instance = realtime;
};
