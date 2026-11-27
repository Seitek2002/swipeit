// Кеш картинок колоды (TECH_SPEC §6 «Предзагрузка фото колоды»): загрузка
// через new Image() + decode(), не больше 2 одновременно, приоритет — у фото,
// которое человек уже открыл, отмена того, что выпало из окна.
//
// Объекты HTMLImageElement держим, пока фото в окне: так браузер не выкидывает
// декодированную картинку, и <img> с тем же URL рисуется в следующий кадр.

export type ImageStatus = "error" | "idle" | "loading" | "queued" | "ready";

export type LoadableImage = {
  decode: () => Promise<void>;
  src: string;
};

type Deps = {
  clearTimer: (id: unknown) => void;
  createImage: () => LoadableImage;
  setTimer: (callback: () => void, ms: number) => unknown;
};

type Entry = {
  image?: LoadableImage;
  status: Exclude<ImageStatus, "idle">;
  timer?: unknown;
  // Последнее обращение — для вытеснения старых готовых картинок.
  touched: number;
};

export const MAX_PARALLEL = 2;
// Дольше — «Фото не загрузилось» (DESIGN.md §7 GiftCard).
export const LOAD_TIMEOUT_MS = 8000;
// Сколько готовых картинок вне окна можно держать в памяти.
export const MAX_KEPT = 20;

export const createImageCache = ({
  createImage,
  setTimer,
  clearTimer,
}: Deps) => {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  // Группы желаемых картинок: «deck» (окно колоды), «details» (шторка) и т. п.
  const groups = new Map<string, readonly string[]>();
  // То, что не грузим, но и не выкидываем (последняя свайпнутая карточка).
  let kept: readonly string[] = [];
  // Открытые сейчас фото: вне очереди, последнее открытое — первым.
  const visible: string[] = [];
  let clock = 0;

  const notify = () => listeners.forEach((listener) => listener());

  const wanted = (): string[] => [
    ...new Set([...[...visible].reverse(), ...[...groups.values()].flat()]),
  ];

  const stop = (entry: Entry) => {
    if (entry.timer !== undefined) clearTimer(entry.timer);
    entry.timer = undefined;
    // Отмена загрузки: браузер обрывает запрос, если он ещё идёт.
    if (entry.image) entry.image.src = "";
    entry.image = undefined;
  };

  const start = (src: string, entry: Entry) => {
    const image = createImage();
    entry.image = image;
    entry.status = "loading";
    entry.timer = setTimer(() => {
      if (entries.get(src) !== entry || entry.status !== "loading") return;
      stop(entry);
      entry.status = "error";
      notify();
      pump();
    }, LOAD_TIMEOUT_MS);
    image.src = src;
    image.decode().then(
      () => {
        if (entries.get(src) !== entry || entry.image !== image) return;
        if (entry.timer !== undefined) clearTimer(entry.timer);
        entry.timer = undefined;
        entry.status = "ready";
        notify();
        pump();
      },
      () => {
        if (entries.get(src) !== entry || entry.image !== image) return;
        stop(entry);
        entry.status = "error";
        notify();
        pump();
      },
    );
  };

  // Пересобрать очередь: снять лишнее, запустить следующее, вытеснить
  // старые готовые картинки вне окна.
  //
  // Начатую загрузку обрывает только сдвиг окна колоды (cancelLoading —
  // свайп, TECH_SPEC §6). Уход с экрана, закрытое фото, «последняя
  // свайпнутая» её не трогают: фото докачивается в кеш, и при возврате
  // в ленту не скачивается второй раз. Из очереди снимается сразу.
  const pump = (cancelLoading = false) => {
    const order = wanted();
    const inWindow = new Set(order);
    let changed = false;

    for (const [src, entry] of entries) {
      if (inWindow.has(src)) continue;
      if (
        entry.status === "queued" ||
        (entry.status === "loading" && cancelLoading)
      ) {
        stop(entry);
        entries.delete(src);
        changed = true;
      }
    }

    order.forEach((src) => {
      if (!entries.has(src)) {
        entries.set(src, { status: "queued", touched: ++clock });
        changed = true;
      }
    });

    // Открытое фото не ждёт предзагрузку: если оба места заняты, оно
    // получает третье. Фоновую загрузку не обрываем — иначе на медленной сети
    // то же фото скачивалось бы дважды.
    const shown = new Set(visible);
    let active = order.filter(
      (src) => entries.get(src)?.status === "loading",
    ).length;
    for (const src of order) {
      const entry = entries.get(src);
      if (entry?.status !== "queued") continue;
      const limit = shown.has(src) ? MAX_PARALLEL + 1 : MAX_PARALLEL;
      if (active >= limit) continue;
      start(src, entry);
      active += 1;
      changed = true;
    }

    const keep = new Set([...inWindow, ...kept]);
    const spare = [...entries.entries()]
      .filter(([src, entry]) => !keep.has(src) && entry.status !== "loading")
      .sort(([, a], [, b]) => a.touched - b.touched);
    while (spare.length > MAX_KEPT) {
      const [src, entry] = spare.shift()!;
      stop(entry);
      entries.delete(src);
      changed = true;
    }

    if (changed) notify();
  };

  return {
    getStatus: (src: string | undefined): ImageStatus =>
      (src && entries.get(src)?.status) || "idle",

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    // Окно группы в порядке загрузки. Новое окно (свайп) обрывает то, что
    // из него выпало. Пустой список — группа больше не нужна (экран ушёл):
    // начатое докачивается.
    setGroup: (name: string, srcs: readonly string[]) => {
      if (srcs.length === 0) groups.delete(name);
      else groups.set(name, srcs);
      srcs.forEach((src) => {
        const entry = entries.get(src);
        if (entry) entry.touched = ++clock;
      });
      pump(srcs.length > 0);
    },

    setKept: (srcs: readonly string[]) => {
      kept = srcs;
      pump();
    },

    // Фото открыто на экране — поднять в начало очереди, пока не закрыто.
    show: (src: string) => {
      visible.push(src);
      const entry = entries.get(src);
      if (entry) entry.touched = ++clock;
      pump();
      return () => {
        const index = visible.lastIndexOf(src);
        if (index >= 0) visible.splice(index, 1);
        pump();
      };
    },

    // «Повторить»: забыть ошибку и загрузить заново.
    retry: (src: string) => {
      const entry = entries.get(src);
      if (entry?.status === "error") entries.delete(src);
      pump();
    },
  };
};

export type ImageCache = ReturnType<typeof createImageCache>;
