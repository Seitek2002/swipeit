"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight, Check, Plus, X } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { useFriends, useMe } from "@/entities/user";

import { createSantaGame, isApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock } from "@/shared/lib/clock";
import { formatNumber, toDateKey } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  IconButton,
  Screen,
  ScreenBody,
  SegmentedControl,
  TextField,
  toast,
} from "@/shared/ui";

type Person = { avatarColor: string; id: string; name: string };
type Pair = [string, string];

const BUDGET_HINTS = [1000, 2000, 3000, 5000];
const DAY = 24 * 60 * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${toDateKey(timestamp)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

const samePair = (a: Pair, b: Pair) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

// «Эти двое не дарят друг другу» (DESIGN.md §8.8): выбрать двоих из игры.
const PairSheet = ({
  open,
  people,
  onClose,
  onAdd,
}: {
  onAdd: (pair: Pair) => void;
  onClose: () => void;
  open: boolean;
  people: Person[];
}) => {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      title="Эти двое не дарят друг другу"
      footer={
        <Button
          size="lg"
          disabled={picked.length !== 2}
          onClick={() => {
            const [a, b] = picked;
            if (a && b) onAdd([a, b]);
            setPicked([]);
          }}
        >
          Добавить пару
        </Button>
      }
    >
      <p className="text-body text-rose mb-4">
        Например, пара или те, кто и так дарит друг другу. Выбери двоих.
      </p>
      <div className="flex flex-wrap gap-2 pb-2">
        {people.map((person) => (
          <Chip
            key={person.id}
            selected={picked.includes(person.id)}
            disabled={picked.length === 2 && !picked.includes(person.id)}
            onClick={() => setPicked((list) => toggle(list, person.id))}
          >
            {person.name}
          </Chip>
        ))}
      </div>
    </BottomSheet>
  );
};

// Новая игра Тайного Санты (DESIGN.md §8.8): название, бюджет с
// подсказками, дата обмена, жеребьёвка вручную или по дате, участники,
// исключения пар.
export const SantaCreatePage = () => {
  const router = useRouter();
  const { data: me } = useMe();
  const friends = useFriends();
  const [title, setTitle] = useState("");
  const [budget, setBudget] = useState("2000");
  const [exchangeDate, setExchangeDate] = useState(() =>
    toDateKey(clock.now() + 14 * DAY),
  );
  const [drawMode, setDrawMode] = useState<"date" | "manual">("manual");
  const [drawAt, setDrawAt] = useState(() =>
    toLocalInput(clock.now() + 7 * DAY),
  );
  const [invited, setInvited] = useState<string[]>([]);
  const [exclusions, setExclusions] = useState<Pair[]>([]);
  const [pairOpen, setPairOpen] = useState(false);

  const people: Person[] = [
    ...(me ? [{ id: me.id, name: me.name, avatarColor: me.avatarColor }] : []),
    ...(friends.data ?? [])
      .filter(({ user }) => invited.includes(user.id))
      .map(({ user }) => ({
        id: user.id,
        name: user.name,
        avatarColor: user.avatarColor,
      })),
  ];
  const nameOf = (id: string) =>
    people.find((person) => person.id === id)?.name ?? "…";

  const create = useMutation({
    mutationFn: createSantaGame,
    onSuccess: (view) => router.replace(ROUTES.SANTA_GAME(view.game.id)),
    onError: (error) =>
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось создать игру. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  // Только цифры и пробелы-разделители: «1500.50» или «1,5» — ошибка, а не
  // бюджет в сто раз больше или меньше.
  const budgetValue = /^\s*\d[\d\s]*$/.test(budget)
    ? Number(budget.replace(/\s/g, ""))
    : Number.NaN;
  const budgetError =
    budget.trim() && !(budgetValue > 0)
      ? "Целое число в сомах, например 2 000"
      : undefined;
  const drawAtValid =
    drawMode === "manual" || !Number.isNaN(Date.parse(drawAt));
  const canSubmit =
    title.trim().length > 0 &&
    budgetValue > 0 &&
    Boolean(exchangeDate) &&
    drawAtValid;
  // Исключения — только между теми, кто сейчас в игре.
  const activeExclusions = exclusions.filter(
    ([a, b]) =>
      people.some((person) => person.id === a) &&
      people.some((person) => person.id === b),
  );

  const submit = () =>
    create.mutate({
      title: title.trim(),
      budget: budgetValue,
      exchangeDate,
      drawMode,
      drawAt: drawMode === "date" ? new Date(drawAt).toISOString() : undefined,
      participantIds: invited,
      exclusions: activeExclusions,
    });

  return (
    <Screen>
      <AppHeader
        title="Новая игра"
        showBack
        backHref={ROUTES.SANTA}
        showAvatar={false}
      />
      <ScreenBody className="px-5 pt-2 pb-6">
        <div className="flex flex-col gap-6">
          <TextField
            label="Название"
            placeholder="Новый год в офисе"
            maxLength={60}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <div className="flex flex-col gap-2.5">
            <TextField
              label="Бюджет подарка, сом"
              inputMode="numeric"
              value={budget}
              error={budgetError}
              onChange={(event) => setBudget(event.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              {BUDGET_HINTS.map((hint) => (
                <Chip
                  key={hint}
                  selected={budgetValue === hint}
                  onClick={() => setBudget(String(hint))}
                >
                  {formatNumber(hint)}
                </Chip>
              ))}
            </div>
          </div>
          <TextField
            label="Обмен подарками"
            type="date"
            value={exchangeDate}
            min={toDateKey(clock.now())}
            onChange={(event) => setExchangeDate(event.target.value)}
          />
          <div className="flex flex-col gap-3">
            <p className="text-caption text-rose">Жеребьёвка</p>
            <SegmentedControl
              label="Жеребьёвка"
              value={drawMode}
              onChange={setDrawMode}
              options={[
                { value: "manual", label: "Когда все соберутся" },
                { value: "date", label: "По дате" },
              ]}
            />
            {drawMode === "date" && (
              <TextField
                label="Когда провести"
                type="datetime-local"
                value={drawAt}
                min={toLocalInput(clock.now())}
                onChange={(event) => setDrawAt(event.target.value)}
              />
            )}
          </div>

          <section>
            <p className="text-label mb-1">Кто играет</p>
            <ul aria-label="Друзья">
              {(friends.data ?? []).map(({ user }) => {
                const checked = invited.includes(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={checked}
                      onClick={() => {
                        setInvited((list) => toggle(list, user.id));
                        // Убрали из игры — убираем и его пары исключений.
                        if (checked) {
                          setExclusions((list) =>
                            list.filter((pair) => !pair.includes(user.id)),
                          );
                        }
                      }}
                      className="border-line flex min-h-[60px] w-full items-center gap-3.5 border-b text-left"
                    >
                      <Avatar
                        name={user.name}
                        color={user.avatarColor}
                        size={40}
                        decorative
                      />
                      <span className="text-body text-paper flex-1 font-semibold">
                        {user.name}
                      </span>
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-6 place-items-center rounded-md border-[1.5px]",
                          checked
                            ? "bg-paper border-paper text-ink"
                            : "border-rose/60",
                        )}
                      >
                        {checked && <Check size={16} strokeWidth={2.5} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <p className="text-caption text-rose mt-2">
              Остальных позовёшь ссылкой с экрана игры. Нужно хотя бы трое.
            </p>
          </section>

          <section className="flex flex-col gap-2.5">
            <p className="text-label">Исключения</p>
            {activeExclusions.map((pair) => (
              <div
                key={pair.join(":")}
                className="bg-velvet-2 border-line rounded-field flex min-h-12 items-center gap-2 border pr-1 pl-3.5"
              >
                <span className="text-body text-paper flex flex-1 items-center gap-2">
                  {nameOf(pair[0])}
                  <ArrowLeftRight
                    aria-label="не дарят друг другу"
                    size={16}
                    strokeWidth={1.75}
                    className="text-rose"
                  />
                  {nameOf(pair[1])}
                </span>
                <IconButton
                  label={`Убрать пару ${nameOf(pair[0])} и ${nameOf(pair[1])}`}
                  onClick={() =>
                    setExclusions((list) =>
                      list.filter((item) => !samePair(item, pair)),
                    )
                  }
                >
                  <X aria-hidden size={18} strokeWidth={1.75} />
                </IconButton>
              </div>
            ))}
            <Button
              variant="secondary"
              disabled={people.length < 2}
              icon={<Plus aria-hidden size={18} strokeWidth={2} />}
              onClick={() => setPairOpen(true)}
            >
              Эти двое не дарят друг другу
            </Button>
          </section>
        </div>
      </ScreenBody>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <Button
          size="lg"
          className="w-full"
          disabled={!canSubmit}
          loading={create.isPending}
          onClick={submit}
        >
          Создать игру
        </Button>
      </div>
      <PairSheet
        open={pairOpen}
        people={people}
        onClose={() => setPairOpen(false)}
        onAdd={(pair) => {
          setExclusions((list) =>
            list.some((item) => samePair(item, pair)) ? list : [...list, pair],
          );
          setPairOpen(false);
        }}
      />
    </Screen>
  );
};
