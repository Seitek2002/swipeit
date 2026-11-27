"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Cake,
  CalendarHeart,
  CalendarPlus,
  ChevronLeft,
  Flower2,
  Sparkles,
} from "lucide-react";

import { useProduct } from "@/entities/product";
import { useMe, useUpdateMe } from "@/entities/user";
import type { WishlistResponse } from "@/entities/wishlist";

import {
  type ImportantDateView,
  type Occasion,
  createMyDate,
  getMyDates,
  shareWishlist,
  updateMyDate,
  updateWishlistMeta,
  userKeys,
  wishlistKeys,
} from "@/shared/api";
import {
  IMPORTANT_DATE_LABEL_MAX,
  IMPORTANT_DATE_PRESETS,
  IMPORTANT_DATE_PRESET_LABELS,
  type ImportantDatePreset,
} from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { clock, useClockOffset } from "@/shared/lib/clock";
import { absoluteUrl } from "@/shared/lib/dom";
import { formatBirthday, genitive, occasionLabel } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  DayMonthPicker,
  ShareActions,
  Spinner,
  TextArea,
  TextField,
} from "@/shared/ui";

import {
  type ShareStep,
  type WhenIcon,
  displayOccasion,
  knownOccasionFor,
  stepAfterCalendar,
  whenOptions,
} from "./model";

type Props = {
  // Повод напоминания (ReminderBanner «Отправить вишлист»): шторка сразу
  // открывается шагом отправки с этим поводом.
  initialOccasion?: Occasion;
  // Шаг 1 «Имя» (DESIGN.md §8.4) — форму NameSheet даёт страница
  // (features/ask-name): фичи друг друга не импортируют. Пока он есть,
  // шторка показывает его; имя сохранилось — сама переходит дальше.
  nameStep?: ReactNode;
  onClose: () => void;
  // NAME_REQUIRED от сервера: страница спрашивает имя и повторяет отправку.
  onShareError?: (error: unknown, retry: () => void) => boolean;
  open: boolean;
  wishlist?: WishlistResponse;
};

const ERROR_TEXT = "Не получилось сохранить. Попробуй ещё раз";

const WHEN_ICONS: Record<WhenIcon, typeof Cake> = {
  birthday: Cake,
  important: CalendarHeart,
  new_year: Sparkles,
  march_8: Flower2,
};

const ICON = { size: 20, strokeWidth: 1.75, "aria-hidden": true } as const;

const TITLES: Record<ShareStep, string> = {
  name: "Как тебя зовут?",
  when: "К какому дню друзьям готовить подарки?",
  calendar: "К какому дню друзьям готовить подарки?",
  "is-birthday": "Это твой день рождения?",
  what: "Что за повод?",
  send: "Отправить вишлист",
};

// Куда ведёт стрелка «Назад» (DESIGN.md §8.4): с шага 2 к имени не ведёт —
// имя уже сохранено; пока открыт календарь, стрелка возвращает к списку.
const BACK: Partial<Record<ShareStep, ShareStep>> = {
  calendar: "when",
  "is-birthday": "calendar",
  what: "calendar",
  send: "when",
};

// Фото желания для открытки — только товары каталога: фото своих желаний в
// ссылку не попадают, на открытке их тоже не показываем.
const PreviewPhoto = ({
  productId,
  index,
}: {
  index: number;
  productId: string;
}) => {
  const { data: product } = useProduct(productId);
  const src = product?.images[0]?.src;
  const tilt = [
    "-rotate-[8deg] -translate-x-9",
    "rotate-0 z-[2]",
    "rotate-[8deg] translate-x-9",
  ];
  return (
    <div
      className={cn(
        "paper rounded-field shadow-paper absolute top-0 left-1/2 -ml-9 h-24 w-[72px] overflow-hidden p-1",
        tilt[index],
      )}
    >
      {src && (
        <img
          src={withBasePath(src)}
          alt=""
          className="size-full rounded-[10px] object-cover"
        />
      )}
    </div>
  );
};

const OptionRow = ({
  icon: Icon,
  label,
  loading,
  disabled,
  onClick,
}: {
  disabled?: boolean;
  icon: typeof Cake;
  label: string;
  loading?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    className="bg-velvet-3 text-paper flex min-h-12 w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-medium disabled:opacity-60"
  >
    <Icon {...ICON} className="text-rose flex-none" />
    <span className="min-w-0 flex-1">{label}</span>
    {loading && <Spinner className="size-[18px]" />}
  </button>
);

// Отправка вишлиста (DESIGN.md §8.4) шагами: имя → «К какому дню…» (дата
// из списка, календарь или «Без даты») → «Это твой день рождения?» / «Что
// за повод?» → сообщение и отправка. Каждый шаг — запрос к серверу (мок):
// кнопка в loading, ошибка на месте, выбранное не теряется.
export const WishlistShareSheet = ({
  open,
  onClose,
  wishlist,
  nameStep,
  onShareError,
  initialOccasion,
}: Props) => {
  const queryClient = useQueryClient();
  const { data: me } = useMe();
  const updateMe = useUpdateMe();
  const now = clock.at(useClockOffset());
  const meta = wishlist?.meta;
  const dates = useQuery({
    queryKey: userKeys.dates(),
    queryFn: getMyDates,
    enabled: open,
  });
  const myDates = dates.data ?? [];

  const [step, setStep] = useState<ShareStep>("when");
  const [occasion, setOccasion] = useState<Occasion | undefined>(
    meta?.occasion,
  );
  // "MM-DD" из календаря; null — день ещё не выбран.
  const [picked, setPicked] = useState<null | string>(null);
  // Дата, сохранённая на шаге «Что за повод?», — для «Сохранили как …».
  const [saved, setSaved] = useState<ImportantDateView | null>(null);
  const [renaming, setRenaming] = useState<null | string>(null);
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [message, setMessage] = useState(meta?.message ?? "");
  const [pending, setPending] = useState<null | string>(null);
  const [error, setError] = useState<null | string>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setStep(initialOccasion ? "send" : "when");
      setPicked(null);
      setOccasion(initialOccasion ?? meta?.occasion);
      setMessage(meta?.message ?? "");
      setSaved(null);
      setRenaming(null);
      setCustomOpen(false);
      setCustomLabel("");
      setError(null);
    }
  }

  const go = (next: ShareStep) => {
    setError(null);
    setStep(next);
  };

  // Повод сохраняется сразу — сервер сам ставит дату и готовый повод
  // (TECH_SPEC §6), шаг отправки показывает его так, как увидят гости.
  const choose = async (next: Occasion, key: string, fromSaved = false) => {
    // «Сохранили как …» — только у даты, сохранённой на этом шаге: другой
    // повод её строку убирает, иначе «Переименовать» правило бы не то.
    if (!fromSaved) setSaved(null);
    setPending(key);
    setError(null);
    try {
      const updated = await updateWishlistMeta({ occasion: next });
      setOccasion(updated.occasion);
      void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
      setStep("send");
    } catch {
      setError(ERROR_TEXT);
    } finally {
      setPending(null);
    }
  };

  const saveDate = async (input: {
    label?: string;
    preset?: ImportantDatePreset;
  }) => {
    if (!picked) return;
    const key = input.preset ?? (input.label ? "custom" : "skip");
    setPending(key);
    setError(null);
    try {
      const date = await createMyDate({ date: picked, ...input });
      void queryClient.invalidateQueries({ queryKey: userKeys.dates() });
      setSaved(date);
      await choose({ kind: "important", dateId: date.id }, key, true);
    } catch {
      setError(ERROR_TEXT);
      setPending(null);
    }
  };

  const afterCalendar = () => {
    if (!picked) return;
    const known = knownOccasionFor(picked, me, myDates);
    if (known) void choose(known, "calendar");
    else go(stepAfterCalendar(picked, me, myDates));
  };

  const confirmBirthday = () => {
    if (!picked) return;
    setPending("birthday-yes");
    setError(null);
    updateMe.mutate(
      { birthday: picked },
      {
        onSuccess: () => void choose({ kind: "birthday" }, "birthday-yes"),
        onError: () => {
          setError(ERROR_TEXT);
          setPending(null);
        },
      },
    );
  };

  const rename = async () => {
    if (!saved || renaming === null) return;
    const label = renaming.trim();
    setPending("rename");
    setError(null);
    try {
      const updated = await updateMyDate(saved.id, { label: label || null });
      void queryClient.invalidateQueries({ queryKey: userKeys.dates() });
      setSaved(updated);
      setRenaming(null);
    } catch {
      setError(ERROR_TEXT);
    } finally {
      setPending(null);
    }
  };

  const photos = (wishlist?.items ?? [])
    .filter(
      (item) => item.status === "active" && item.source.kind === "product",
    )
    .slice(0, 3)
    .map((item) =>
      item.source.kind === "product" ? item.source.productId : "",
    );
  const shown = occasion && displayOccasion(occasion, me, myDates, now);
  const occasionLine =
    shown && shown.kind !== "just_because" ? occasionLabel(shown) : "";

  // Повод сохраняется вместе с сообщением: у повода из напоминания
  // отдельного шага не было (DESIGN.md §7 ReminderBanner).
  const getPayload = async () => {
    await updateWishlistMeta(occasion ? { occasion, message } : { message });
    void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
    const { url } = await shareWishlist();
    return {
      title: "Мой вишлист",
      text: occasionLine
        ? `Мой вишлист ${occasionLine}. Выбери, что подарить, — я не узнаю, кто что выбрал`
        : "Мой вишлист. Выбери, что подарить, — я не узнаю, кто что выбрал",
      url: absoluteUrl(url),
    };
  };

  const current: ShareStep = nameStep ? "name" : step;
  // Кнопка, по которой перешли на шаг, исчезает вместе с ним — фокус падал
  // на <body>, и Escape больше не закрывал шторку. Переводим его в шаг —
  // а на шаге имени — в поле («поле с автофокусом», DESIGN §7 NameSheet).
  // На шаге отправки поле сообщения фокус не получает: не нужна клавиатура.
  const stepRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const step = stepRef.current;
    const field =
      current === "name" ? step?.querySelector<HTMLElement>("input") : null;
    (field ?? step)?.focus({ preventScroll: true });
  }, [open, current]);
  const back = BACK[current];
  const busy = pending !== null;

  const backButton = back && (
    <button
      type="button"
      aria-label="Назад"
      onClick={() => go(back)}
      className="text-paper -ml-2 grid size-11 flex-none place-items-center rounded-full"
    >
      <ChevronLeft aria-hidden size={24} strokeWidth={1.75} />
    </button>
  );

  const errorLine = error && (
    <p role="alert" className="text-caption text-pomegranate">
      {error}
    </p>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={TITLES[current]}
      headerStart={backButton}
      height={current === "send" ? "full" : "auto"}
    >
      <div ref={stepRef} tabIndex={-1} className="outline-none">
        {current === "name" && nameStep}

        {current === "when" && (
          <div className="flex flex-col gap-2 pb-2">
            <p className="text-caption text-rose mb-1">
              Друзья увидят дату и успеют выбрать
            </p>
            {whenOptions(me, myDates, now).map((option) => (
              <OptionRow
                key={option.key}
                icon={WHEN_ICONS[option.icon]}
                label={option.label}
                loading={pending === option.key}
                disabled={busy}
                onClick={() => void choose(option.occasion, option.key)}
              />
            ))}
            <OptionRow
              icon={CalendarPlus}
              label="Выбрать дату"
              disabled={busy}
              onClick={() => go("calendar")}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => void choose({ kind: "just_because" }, "none")}
              className="text-rose text-label mt-1 min-h-11 self-center underline underline-offset-2"
            >
              {pending === "none" ? "Сохраняем…" : "Без даты"}
            </button>
            {errorLine}
          </div>
        )}

        {current === "calendar" && (
          <div className="flex flex-col gap-4 pb-2">
            <p className="text-caption text-rose">
              Друзья увидят дату и успеют выбрать
            </p>
            <DayMonthPicker
              value={picked}
              onChange={setPicked}
              disabled={pending === "calendar"}
            />
            {errorLine}
            <Button
              size="lg"
              variant="paper"
              disabled={!picked}
              loading={pending === "calendar"}
              onClick={afterCalendar}
            >
              Дальше
            </Button>
          </div>
        )}

        {current === "is-birthday" && (
          <div className="flex flex-col gap-3 pb-2">
            <p className="text-title-3">{formatBirthday(picked ?? "")}</p>
            <p className="text-caption text-rose">
              Запомним, чтобы больше не спрашивать и напомнить за месяц
            </p>
            {errorLine}
            <Button
              size="lg"
              className="mt-2"
              loading={pending === "birthday-yes"}
              disabled={busy}
              onClick={confirmBirthday}
            >
              Да, мой день рождения
            </Button>
            <Button
              size="lg"
              variant="secondary"
              disabled={busy}
              onClick={() => go("what")}
            >
              Нет, другой повод
            </Button>
          </div>
        )}

        {current === "what" && (
          <div className="flex flex-col gap-4 pb-2">
            <p className="text-caption text-rose">
              {formatBirthday(picked ?? "")}. Так напоминание будет понятным
            </p>
            <div className="flex flex-wrap gap-2">
              {IMPORTANT_DATE_PRESETS.map((preset) => (
                <Chip
                  key={preset}
                  disabled={busy}
                  onClick={() => void saveDate({ preset })}
                  icon={
                    pending === preset ? (
                      <Spinner className="size-3.5" />
                    ) : undefined
                  }
                >
                  {IMPORTANT_DATE_PRESET_LABELS[preset]}
                </Chip>
              ))}
              <Chip
                selected={customOpen}
                disabled={busy}
                onClick={() => setCustomOpen((value) => !value)}
              >
                Свой вариант
              </Chip>
            </div>
            {customOpen && (
              <div className="flex flex-col gap-3">
                <TextField
                  aria-label="Свой повод"
                  autoFocus
                  placeholder="Например, защита диплома"
                  maxLength={IMPORTANT_DATE_LABEL_MAX}
                  value={customLabel}
                  onChange={(event) => setCustomLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter")
                      void saveDate({ label: customLabel.trim() || undefined });
                  }}
                />
                <Button
                  variant="paper"
                  loading={pending === "custom" || pending === "skip"}
                  disabled={busy}
                  onClick={() =>
                    void saveDate({ label: customLabel.trim() || undefined })
                  }
                >
                  Готово
                </Button>
              </div>
            )}
            {errorLine}
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveDate({})}
              className="text-rose text-label min-h-11 self-center underline underline-offset-2"
            >
              {pending === "skip" && !customOpen ? "Сохраняем…" : "Пропустить"}
            </button>
          </div>
        )}

        {current === "send" && (
          <div className="flex flex-col gap-5 pb-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <p className="text-body text-paper min-w-0">
                  {occasionLine || "Без даты"}
                </p>
                <button
                  type="button"
                  onClick={() => go("when")}
                  className="text-mandarin text-label min-h-11 flex-none"
                >
                  Изменить
                </button>
              </div>
              {saved &&
                (renaming === null ? (
                  <p className="text-caption text-rose">
                    Сохранили как «{saved.title}».{" "}
                    <button
                      type="button"
                      onClick={() => setRenaming(saved.label ?? "")}
                      className="text-mandarin relative underline underline-offset-2 before:absolute before:-inset-y-[13px] before:content-['']"
                    >
                      Переименовать
                    </button>
                  </p>
                ) : (
                  <TextField
                    aria-label="Название даты"
                    autoFocus
                    placeholder={saved.title}
                    maxLength={IMPORTANT_DATE_LABEL_MAX}
                    value={renaming}
                    disabled={pending === "rename"}
                    onChange={(event) => setRenaming(event.target.value)}
                    onBlur={() => void rename()}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void rename();
                    }}
                  />
                ))}
              {errorLine}
            </div>

            {/* Превью ссылки — мини-открытка: бирки веером, имя и повод. */}
            <div className="paper rounded-paper shadow-paper flex flex-col items-center gap-3 px-4 pt-5 pb-4">
              <div className="relative h-24 w-full">
                {photos.map((productId, index) => (
                  <PreviewPhoto
                    key={productId}
                    productId={productId}
                    index={index}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                {me && (
                  <Avatar
                    name={me.name}
                    color={me.avatarColor}
                    size={28}
                    decorative
                  />
                )}
                <p className="text-title-2">
                  {me?.name
                    ? `Вишлист ${genitive(me.name, me.audience === "all" ? undefined : me.audience)}`
                    : "Мой вишлист"}
                </p>
              </div>
              {occasionLine && (
                <p className="text-caption text-ink-soft -mt-2">
                  {occasionLine}
                </p>
              )}
            </div>

            <TextArea
              label="Сообщение"
              placeholder="Буду рада любому подарку из списка"
              maxLength={200}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
            />

            {/* Кнопки — в конце шага, а не в липком футере: пять строк по
                48px закрывали превью и сообщение на 360px (QA T25, D3). */}
            <ShareActions
              getPayload={getPayload}
              onError={onShareError}
              qrLabel="QR-код ссылки на вишлист"
            />
          </div>
        )}
      </div>
    </BottomSheet>
  );
};
