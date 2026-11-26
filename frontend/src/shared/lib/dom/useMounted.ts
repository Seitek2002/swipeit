import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

// true только на клиенте после гидратации. Всё, что трогает window,
// localStorage или BroadcastChannel, рендерится после этого (TECH_SPEC §3).
// useSyncExternalStore вместо useEffect+useState: нет лишнего рендера и
// предупреждения о setState в эффекте.
export function useMounted(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
