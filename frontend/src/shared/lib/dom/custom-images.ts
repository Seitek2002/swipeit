import { useEffect, useState } from "react";

import { del, get, set } from "idb-keyval";
import { nanoid } from "nanoid";

// Фото своих желаний в режиме local — в IndexedDB (TECH_SPEC §5): localStorage
// с его ~5 МБ на картинки не хватит. В базу кладём только ключ.
const PREFIX = "swipeit:img:";

export const saveCustomImage = async (blob: Blob): Promise<string> => {
  const key = nanoid(12);
  await set(PREFIX + key, blob);
  return key;
};

export const deleteCustomImage = (key: string) => del(PREFIX + key);

// Ссылка на фото по ключу (object URL), пока компонент на экране.
export const useCustomImageUrl = (key?: string): null | string => {
  const [url, setUrl] = useState<null | string>(null);

  useEffect(() => {
    if (!key) return;
    let objectUrl: null | string = null;
    let cancelled = false;
    get<Blob>(PREFIX + key)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [key]);

  return key ? url : null;
};
