import { useSyncExternalStore } from "react";

// Связь с LAN-сервером (DESIGN.md §8.11): пока её нет, колода и кнопки
// действий неактивны, висит тост «Нет связи с ноутбуком…». В local связь
// есть всегда.
export type ConnectionStatus = "offline" | "online";

let status: ConnectionStatus = "online";
const listeners = new Set<() => void>();

export const getConnectionStatus = () => status;

export const setConnectionStatus = (next: ConnectionStatus) => {
  if (next === status) return;
  status = next;
  listeners.forEach((listener) => listener());
};

export const subscribeConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useConnectionStatus = () =>
  useSyncExternalStore(
    subscribeConnection,
    getConnectionStatus,
    () => "online" as const,
  );
