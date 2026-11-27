"use client";

import { useState } from "react";

import { useRouter } from "next/navigation";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { NAME_CAPTIONS, useRequireName } from "@/features/ask-name";
import { CustomActivitySheet } from "@/features/custom-activity";

import { type Activity, ActivityTicket } from "@/entities/activity";
import { useFriends } from "@/entities/user";

import {
  type PlanFilters,
  activityKeys,
  createPlan,
  getActivities,
  isApiError,
} from "@/shared/api";
import {
  ACTIVITY_CATEGORY_IDS,
  ACTIVITY_CATEGORY_LABELS,
  ROUTES,
} from "@/shared/config";
import { clock } from "@/shared/lib/clock";
import { pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  Button,
  Chip,
  ProgressDots,
  RangeSlider,
  Screen,
  ScreenBody,
  SegmentedControl,
  TextField,
  toast,
} from "@/shared/ui";

type Mode = "deadline" | "live";
type MatchRule = "all" | "majority";

const STEPS = 3;
const EMPTY_FILTERS: PlanFilters = {
  categories: [],
  budgetPerPerson: { min: 0, max: null },
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

// datetime-local ↔ ISO с часовым поясом устройства.
const pad = (value: number) => String(value).padStart(2, "0");
const toLocalInput = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Шаг 1: название и режим.
const StepBasics = ({
  title,
  onTitle,
  mode,
  onMode,
  deadline,
  onDeadline,
  error,
}: {
  deadline: string;
  error?: string;
  mode: Mode;
  onDeadline: (value: string) => void;
  onMode: (value: Mode) => void;
  onTitle: (value: string) => void;
  title: string;
}) => (
  <div className="flex flex-col gap-6">
    <h2 className="text-title-1">Что за план?</h2>
    <TextField
      label="Название"
      placeholder="Пятница вечером"
      maxLength={60}
      value={title}
      autoFocus
      onChange={(event) => onTitle(event.target.value)}
    />
    <div className="flex flex-col gap-3">
      <p className="text-caption text-rose">Когда выбираем</p>
      <SegmentedControl
        label="Когда выбираем"
        value={mode}
        onChange={onMode}
        options={[
          { value: "live", label: "Прямо сейчас" },
          { value: "deadline", label: "До даты" },
        ]}
      />
      <p className="text-caption text-rose">
        {mode === "live"
          ? "Все свайпают одновременно — совпадения видно сразу."
          : "Каждый свайпает, когда удобно. Итоги — когда закончат все или наступит дата."}
      </p>
    </div>
    {mode === "deadline" && (
      <TextField
        label="До какого времени"
        type="datetime-local"
        value={deadline}
        min={toLocalInput(clock.now())}
        error={error}
        onChange={(event) => onDeadline(event.target.value)}
      />
    )}
  </div>
);

// Шаг 2: кто идёт и правило совпадения.
const StepPeople = ({
  selected,
  onToggle,
  matchRule,
  onMatchRule,
}: {
  matchRule: MatchRule;
  onMatchRule: (value: MatchRule) => void;
  onToggle: (id: string) => void;
  selected: string[];
}) => {
  const friends = useFriends();
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-title-1">Кто идёт?</h2>
      <ul className="flex flex-col" aria-label="Друзья">
        {(friends.data ?? []).map(({ user }) => {
          const checked = selected.includes(user.id);
          return (
            <li key={user.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                onClick={() => onToggle(user.id)}
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
      <p className="text-caption text-rose -mt-3">
        Ссылку-приглашение для остальных пришлём в лобби — по ней вступит любой.
      </p>
      <div className="flex flex-col gap-3">
        <p className="text-caption text-rose">Совпадение — это когда</p>
        <SegmentedControl
          label="Правило совпадения"
          value={matchRule}
          onChange={onMatchRule}
          options={[
            { value: "all", label: "Все за" },
            { value: "majority", label: "Большинство за" },
          ]}
        />
      </div>
    </div>
  );
};

// Шаг 3: что выбираем — категории, бюджет, свои занятия.
const StepActivities = ({
  filters,
  onFilters,
  custom,
  onAddCustom,
  onRemoveCustom,
}: {
  custom: Activity[];
  filters: PlanFilters;
  onAddCustom: () => void;
  onFilters: (filters: PlanFilters) => void;
  onRemoveCustom: (id: string) => void;
}) => {
  const catalog = useQuery({
    queryKey: activityKeys.list(filters),
    queryFn: () => getActivities(filters),
    placeholderData: keepPreviousData,
  });
  const total = (catalog.data?.length ?? 0) + custom.length;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-title-1">Что выбираем?</h2>
      <div>
        <p className="text-label mb-3">Категории</p>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_CATEGORY_IDS.map((category) => (
            <Chip
              key={category}
              selected={filters.categories.includes(category)}
              onClick={() =>
                onFilters({
                  ...filters,
                  categories: toggle(filters.categories, category),
                })
              }
            >
              {ACTIVITY_CATEGORY_LABELS[category]}
            </Chip>
          ))}
        </div>
      </div>
      <RangeSlider
        label="Бюджет на человека"
        value={filters.budgetPerPerson}
        onChange={(budgetPerPerson) =>
          onFilters({ ...filters, budgetPerPerson })
        }
      />
      <div className="flex flex-col gap-3">
        <p className="text-label">Свои занятия</p>
        {custom.map((activity) => (
          <div key={activity.id} className="relative">
            <ActivityTicket activity={activity} />
            <Button
              size="sm"
              variant="secondary"
              className="absolute top-4 right-4"
              onClick={() => onRemoveCustom(activity.id)}
            >
              Убрать
            </Button>
          </div>
        ))}
        <Button
          variant="secondary"
          icon={<Plus aria-hidden size={18} strokeWidth={2} />}
          onClick={onAddCustom}
        >
          Своё занятие
        </Button>
      </div>
      <p className="text-caption text-rose" aria-live="polite">
        {catalog.data
          ? total === 0
            ? "В этих рамках занятий нет — убери фильтр или добавь своё."
            : `В колоде будет ${pluralize(total, ["занятие", "занятия", "занятий"])}`
          : "Считаем занятия…"}
      </p>
    </div>
  );
};

// Новый план (DESIGN.md §8.7): три шага с прогресс-точками — название и
// режим, кто идёт, что выбираем.
export const PlanCreatePage = () => {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [mode, setMode] = useState<Mode>("live");
  const [deadline, setDeadline] = useState("");
  const [deadlineError, setDeadlineError] = useState<string>();
  const [participants, setParticipants] = useState<string[]>([]);
  const [matchRule, setMatchRule] = useState<MatchRule>("all");
  const [filters, setFilters] = useState<PlanFilters>(EMPTY_FILTERS);
  const [custom, setCustom] = useState<Activity[]>([]);
  const [customOpen, setCustomOpen] = useState(false);

  // Нет имени — NameSheet по «Начать» (DESIGN.md §8.7), потом план
  // создаётся сам; NAME_REQUIRED от сервера — та же шторка и повтор.
  const requireName = useRequireName(NAME_CAPTIONS.plan);
  const create = useMutation({
    mutationFn: createPlan,
    onSuccess: (view) => router.replace(ROUTES.PLAN_SESSION(view.plan.id)),
    onError: (error, input) => {
      if (requireName.handleError(error, () => create.mutate(input))) return;
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось создать план. Попробуй ещё раз",
        { tone: "error" },
      );
    },
  });

  const next = () => {
    if (step === 0 && mode === "deadline") {
      const at = deadline ? new Date(deadline).getTime() : Number.NaN;
      if (Number.isNaN(at) || at <= clock.now()) {
        setDeadlineError("Выбери время позже, чем сейчас");
        return;
      }
      setDeadlineError(undefined);
    }
    if (step < STEPS - 1) {
      setStep(step + 1);
      return;
    }
    const input = {
      title: title.trim(),
      mode,
      deadline:
        mode === "deadline" ? new Date(deadline).toISOString() : undefined,
      participantIds: participants,
      matchRule,
      filters,
      customActivityIds: custom.map((activity) => activity.id),
    };
    requireName.run(() => create.mutate(input));
  };

  const canNext = step !== 0 || title.trim().length > 0;

  return (
    <Screen>
      <AppHeader
        title="Новый план"
        showBack
        backHref={step === 0 ? ROUTES.PLANS : undefined}
        onBack={step === 0 ? undefined : () => setStep(step - 1)}
        showAvatar={false}
      />
      <div className="flex flex-none justify-center pb-2">
        <ProgressDots
          count={STEPS}
          current={step}
          label="Шаги создания плана"
        />
      </div>
      <ScreenBody className="px-5 pt-2 pb-6">
        {step === 0 && (
          <StepBasics
            title={title}
            onTitle={setTitle}
            mode={mode}
            onMode={setMode}
            deadline={deadline}
            onDeadline={setDeadline}
            error={deadlineError}
          />
        )}
        {step === 1 && (
          <StepPeople
            selected={participants}
            onToggle={(id) => setParticipants((list) => toggle(list, id))}
            matchRule={matchRule}
            onMatchRule={setMatchRule}
          />
        )}
        {step === 2 && (
          <StepActivities
            filters={filters}
            onFilters={setFilters}
            custom={custom}
            onAddCustom={() => setCustomOpen(true)}
            onRemoveCustom={(id) =>
              setCustom((list) => list.filter((activity) => activity.id !== id))
            }
          />
        )}
      </ScreenBody>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <Button
          size="lg"
          className="w-full"
          disabled={!canNext}
          loading={create.isPending}
          onClick={next}
        >
          {step < STEPS - 1 ? "Дальше" : "Начать"}
        </Button>
      </div>
      <CustomActivitySheet
        open={customOpen}
        onClose={() => setCustomOpen(false)}
        onCreated={(activity) => setCustom((list) => [...list, activity])}
      />
      {requireName.sheet}
    </Screen>
  );
};
