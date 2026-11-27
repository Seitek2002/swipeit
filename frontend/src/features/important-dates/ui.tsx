"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { Cake, CalendarHeart, Plus, Trash2 } from "lucide-react";

import { useMe } from "@/entities/user";

import type { ImportantDateView } from "@/shared/api";
import { IMPORTANT_DATE_LABEL_MAX } from "@/shared/config";
import { formatBirthday } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  BottomSheet,
  Button,
  DayMonthPicker,
  IconButton,
  Skeleton,
  Spinner,
  toast,
} from "@/shared/ui";

import {
  useCreateDate,
  useDeleteDate,
  useMyDates,
  useSetBirthday,
  useUpdateDate,
} from "./api";
import { renamePatch, undoInput } from "./model";

// Что меняем в шторке с календарём.
type SheetTarget =
  | { date: ImportantDateView; kind: "edit" }
  | { kind: "birthday" }
  | { kind: "new" };

const SAVE_ERROR = "Не получилось сохранить. Попробуй ещё раз";

const rowClass = "border-line flex min-h-14 items-center gap-3 border-b";
const iconProps = {
  "aria-hidden": true,
  size: 20,
  strokeWidth: 1.75,
  className: "text-rose flex-none",
} as const;

// Дата справа — таблетка-кнопка (бархат-3, label): у названия и у даты
// разные действия (DESIGN.md §8.9, quick-start.html кадр 7). Визуально 36px,
// зона нажатия 44px — за счёт ::before.
const DatePill = ({
  children,
  label,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    aria-label={label}
    disabled={disabled}
    onClick={onClick}
    className="bg-velvet-3 text-label text-paper relative h-9 flex-none rounded-[14px] px-3 whitespace-nowrap transition-transform duration-[120ms] before:absolute before:-inset-1 before:content-[''] active:scale-[0.96] disabled:pointer-events-none"
  >
    {children}
  </button>
);

// Строка значимой даты: название правится прямо в строке, дата — в шторке,
// корзина удаляет сразу (с «Отменить» в тосте).
const ImportantDateRow = ({
  date,
  onEditDate,
  onDeleted,
}: {
  date: ImportantDateView;
  onDeleted: (removed: ImportantDateView) => void;
  onEditDate: (date: ImportantDateView) => void;
}) => {
  const update = useUpdateDate();
  const remove = useDeleteDate();
  // null — название не правят; строка — черновик в поле. Черновик живёт,
  // пока сохранение не удалось: введённое не теряется.
  const [draft, setDraft] = useState<null | string>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();
  const editing = draft !== null;
  const dayMonth = formatBirthday(date.date);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const save = () => {
    // Enter уже отправил запрос, а потом поле теряет фокус — второй раз не шлём.
    if (draft === null || update.isPending) return;
    const patch = renamePatch(draft, date);
    if (!patch) {
      update.reset();
      setDraft(null);
      return;
    }
    update
      .mutateAsync({ id: date.id, patch })
      .then(() => setDraft(null))
      // Ошибка — под строкой; поле остаётся с тем, что ввели.
      .catch(() => undefined);
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      save();
    } else if (event.key === "Escape") {
      // Escape — передумали: старое название, без запроса.
      event.preventDefault();
      update.reset();
      setDraft(null);
    }
  };

  const handleDelete = () => {
    remove
      .mutateAsync(date.id)
      // then — а не колбэк mutate: строка к этому моменту уже исчезла из
      // списка, а тост с «Отменить» показать всё равно нужно.
      .then(({ date: removed }) => onDeleted(removed))
      .catch(() =>
        toast("Не получилось удалить", {
          tone: "error",
          action: { label: "Повторить", onClick: handleDelete },
        }),
      );
  };

  return (
    <li className={cn(remove.isPending && "pointer-events-none opacity-50")}>
      <div className={rowClass}>
        <CalendarHeart {...iconProps} />
        {editing ? (
          <div className="relative min-w-0 flex-1">
            <input
              ref={inputRef}
              value={draft}
              maxLength={IMPORTANT_DATE_LABEL_MAX}
              aria-label="Название даты"
              aria-invalid={update.isError || undefined}
              aria-describedby={update.isError ? errorId : undefined}
              enterKeyHint="done"
              readOnly={update.isPending}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKey}
              onBlur={save}
              className={cn(
                "bg-velvet-3 text-body text-paper placeholder:text-rose/60 focus-visible:border-mandarin rounded-field h-11 w-full border-[1.5px] border-transparent px-3 pr-9 outline-none",
                update.isError && "border-pomegranate",
              )}
              placeholder="Название"
            />
            {update.isPending && (
              <Spinner className="text-rose absolute top-1/2 right-3 size-4 -translate-y-1/2" />
            )}
          </div>
        ) : (
          <button
            type="button"
            aria-label={`Переименовать: ${date.title}`}
            onClick={() => setDraft(date.title)}
            className="text-body text-paper min-h-11 min-w-0 flex-1 truncate text-left"
          >
            {date.title}
          </button>
        )}
        <DatePill
          label={`${date.title}: ${dayMonth}. Изменить дату`}
          disabled={update.isPending}
          onClick={() => onEditDate(date)}
        >
          {dayMonth}
        </DatePill>
        <IconButton
          label={`Удалить: ${date.title}`}
          className="text-pomegranate -mr-2.5"
          disabled={remove.isPending}
          onClick={handleDelete}
        >
          <Trash2 aria-hidden size={20} strokeWidth={1.75} />
        </IconButton>
      </div>
      {editing && update.isError && (
        <p id={errorId} className="text-caption text-pomegranate pt-1.5 pl-8">
          {SAVE_ERROR}: Enter — повторить
        </p>
      )}
    </li>
  );
};

// «Мои даты» в профиле (DESIGN.md §8.9, quick-start.html кадр 7): день
// рождения, значимые даты, «Добавить дату». Всё сохраняется сразу, без
// «Сохранить» формы профиля.
export const MyDates = ({
  className,
  id,
}: {
  className?: string;
  id?: string;
}) => {
  const me = useMe();
  const dates = useMyDates();
  const setBirthday = useSetBirthday();
  const updateDate = useUpdateDate();
  const createDate = useCreateDate();
  const restore = useCreateDate();
  const headingId = useId();

  // open отдельно от target: пока шторка уезжает, в ней остаётся прежнее
  // содержимое, а не пустота.
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<SheetTarget>({ kind: "new" });
  const [value, setValue] = useState<null | string>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const birthday = me.data?.birthday;

  const openSheet = (next: SheetTarget, initial: null | string) => {
    setTarget(next);
    setValue(initial);
    setFailed(false);
    setOpen(true);
  };

  const close = () => {
    if (!pending) setOpen(false);
  };

  // «Отменить» в тосте: та же дата заново. Не вышло — тост с повтором, чтобы
  // дата не потерялась.
  const undo = (removed: ImportantDateView) => {
    restore.mutateAsync(undoInput(removed)).catch(() =>
      toast("Не получилось вернуть дату", {
        tone: "error",
        action: { label: "Повторить", onClick: () => undo(removed) },
      }),
    );
  };

  const handleDeleted = (removed: ImportantDateView) =>
    toast("Дата удалена", {
      action: { label: "Отменить", onClick: () => undo(removed) },
    });

  // Запрос по тому, что меняем; null — дата та же, просто закрываем.
  const requestFor = (next: string): null | Promise<unknown> => {
    if (target.kind === "birthday")
      return next === birthday ? null : setBirthday.mutateAsync(next);
    if (target.kind === "edit")
      return next === target.date.date
        ? null
        : updateDate.mutateAsync({
            id: target.date.id,
            patch: { date: next },
          });
    const existing = new Set((dates.data ?? []).map((date) => date.id));
    return createDate.mutateAsync({ date: next }).then((created) =>
      // Название дал сервер («Значимая дата N») — говорим какое, чтобы было
      // понятно, что за строка появилась и что её можно переименовать. Такая
      // дата уже была — сервер вернул её, а не дубль.
      existing.has(created.id)
        ? toast(`Эта дата уже есть: «${created.title}»`, { tone: "info" })
        : toast(`Добавили «${created.title}»`),
    );
  };

  const save = () => {
    if (!value || pending) return;
    const request = requestFor(value);
    if (!request) {
      setOpen(false);
      return;
    }
    setPending(true);
    setFailed(false);
    request
      .then(() => setOpen(false))
      // Шторка не закрывается, выбранная дата остаётся — можно повторить.
      .catch(() => setFailed(true))
      .finally(() => setPending(false));
  };

  const sheetTitle =
    target.kind === "birthday"
      ? "День рождения"
      : target.kind === "edit"
        ? target.date.title
        : "Новая дата";

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={cn("flex scroll-mt-4 flex-col", className)}
    >
      <h2 id={headingId} className="text-label text-paper mb-1.5">
        Мои даты
      </h2>

      <ul className="flex flex-col">
        <li className={rowClass}>
          <Cake {...iconProps} />
          {birthday ? (
            <>
              <span className="text-body text-paper min-w-0 flex-1 truncate">
                День рождения
              </span>
              <DatePill
                label={`День рождения: ${formatBirthday(birthday)}. Изменить дату`}
                onClick={() => openSheet({ kind: "birthday" }, birthday)}
              >
                {formatBirthday(birthday)}
              </DatePill>
              {/* Место корзины: даты в строках стоят ровно друг под другом. */}
              <span aria-hidden className="w-[34px] flex-none" />
            </>
          ) : (
            <button
              type="button"
              onClick={() => openSheet({ kind: "birthday" }, null)}
              className="text-body text-paper min-h-11 flex-1 text-left"
            >
              Добавить день рождения
            </button>
          )}
        </li>

        {dates.isPending &&
          [0, 1].map((index) => (
            <li key={index} className="border-line border-b py-2">
              <Skeleton className="h-10" />
            </li>
          ))}
        {dates.data?.map((date) => (
          <ImportantDateRow
            key={date.id}
            date={date}
            onDeleted={handleDeleted}
            onEditDate={(item) =>
              openSheet({ kind: "edit", date: item }, item.date)
            }
          />
        ))}
      </ul>

      {dates.isError && !dates.data && (
        <div className="flex items-center gap-3 pt-3">
          <p className="text-caption text-pomegranate flex-1">
            Не получилось загрузить даты
          </p>
          <Button
            size="sm"
            variant="secondary"
            loading={dates.isFetching}
            onClick={() => void dates.refetch()}
          >
            Повторить
          </Button>
        </div>
      )}

      <button
        type="button"
        onClick={() => openSheet({ kind: "new" }, null)}
        className="text-label text-paper flex min-h-[52px] items-center gap-3 self-start"
      >
        <Plus aria-hidden size={20} strokeWidth={1.75} className="text-rose" />
        Добавить дату
      </button>
      <p className="text-caption text-rose mt-1">
        За месяц до даты напомним обновить вишлист и отправить друзьям
      </p>

      <BottomSheet
        open={open}
        onClose={close}
        title={sheetTitle}
        footer={
          <Button
            size="lg"
            variant="paper"
            disabled={!value}
            loading={pending}
            onClick={save}
          >
            {target.kind === "new" ? "Добавить дату" : "Сохранить"}
          </Button>
        }
      >
        <DayMonthPicker value={value} onChange={setValue} disabled={pending} />
        {failed && (
          <p role="alert" className="text-caption text-pomegranate mt-3">
            {SAVE_ERROR}
          </p>
        )}
      </BottomSheet>
    </section>
  );
};
