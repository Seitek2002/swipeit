import { useEffect, useState } from "react";

import { del, get, set } from "idb-keyval";
import { nanoid } from "nanoid";

// Фото своих желаний в режиме local — в IndexedDB (TECH_SPEC §5): localStorage
// с его ~5 МБ на картинки не хватит. В базу кладём только ключ.
const PREFIX = "swipeit:img:";

// Режим lan (TECH_SPEC §7a): фото живут на ноутбуке (POST /uploads), чтобы
// их видели все телефоны сети. Настраивается при запуске (app/environment).
export type RemoteImageStore = {
  upload(blob: Blob): Promise<string>;
  urlOf(key: string): string;
};

let remote: null | RemoteImageStore = null;

export const setRemoteImageStore = (store: RemoteImageStore) => {
  remote = store;
};

export const saveCustomImage = async (blob: Blob): Promise<string> => {
  if (remote) return remote.upload(blob);
  const key = nanoid(12);
  await set(PREFIX + key, blob);
  return key;
};

// На сервере файлы не удаляем: их могли успеть открыть другие телефоны.
export const deleteCustomImage = async (key: string) => {
  if (!remote) await del(PREFIX + key);
};

// Ссылка на фото по ключу (object URL), пока компонент на экране.
export const useCustomImageUrl = (key?: string): null | string => {
  // Ссылка помнит свой ключ: сменился ключ — старую (уже отозванную) не
  // показываем, пока грузится новая.
  const [loaded, setLoaded] = useState<{ key: string; url: string } | null>(
    null,
  );

  useEffect(() => {
    if (!key || remote) return;
    let objectUrl: null | string = null;
    let cancelled = false;
    get<Blob>(PREFIX + key)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setLoaded({ key, url: objectUrl });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  if (key && remote) return remote.urlOf(key);
  return key && loaded?.key === key ? loaded.url : null;
};
