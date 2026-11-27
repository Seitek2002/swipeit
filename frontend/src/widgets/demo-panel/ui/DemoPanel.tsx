"use client";

import { useState, useSyncExternalStore } from "react";

import { useRouter } from "next/navigation";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";

import { ResetDemoButton } from "@/features/demo-reset";
import { LoadNewYearButton } from "@/features/demo-scenario";

import { type User, useLoginDemo, usePresence } from "@/entities/user";

import {
  type DemoSettings,
  demoKeys,
  getDemoSettings,
  getDemoUsers,
  getMode,
  isBotLeader,
  resetDemoHints,
  subscribeBotLeader,
  updateDemoSettings,
  userKeys,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock, useClockOffset } from "@/shared/lib/clock";
import { formatDayMonth, pluralize, toDateKey } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useDemoSettingsStore, useSessionStore } from "@/shared/store";
import { Avatar, BottomSheet, Button, Chip, Switch, toast } from "@/shared/ui";

import { useBotLog, useBotLogFeed } from "../model";

const DAY = 24 * 60 * 60 * 1000;

const SPEEDS: Array<{ label: string; value: DemoSettings["botSpeed"] }> = [
  { value: "slow", label: "Медленно" },
  { value: "normal", label: "Нормально" },
  { value: "fast", label: "Быстро" },
  { value: "off", label: "Выкл" },
];

const timeLabel = (at: number) =>
  new Date(at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });

// «Смотреть как» (DESIGN.md §8.10): сменить пользователя только в этой
// вкладке — вторая вкладка остаётся собой (сессия вкладки, TECH_SPEC §7).
const WatchAs = ({ onPicked }: { onPicked: () => void }) => {
  const activeUserId = useSessionStore((state) => state.activeUserId);
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const users = useQuery({
    queryKey: demoKeys.users(),
    queryFn: getDemoUsers,
  });

  const pick = (user: User) => {
    if (user.id === activeUserId) return;
    // «Последнего пользователя» не трогаем: новые вкладки открываются собой.
    setActiveUser(user.id, { remember: false });
    toast(
      user.name?.trim()
        ? `Смотришь как ${user.name}`
        : "Смотришь как профиль без имени",
    );
    onPicked();
  };

  return (
    <section>
      <p className="text-label mb-3">Смотреть как</p>
      <ul className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pt-1 pb-1">
        {(users.data ?? []).map((user) => {
          const active = user.id === activeUserId;
          return (
            <li key={user.id} className="flex-none">
              <button
                type="button"
                aria-pressed={active}
                onClick={() => pick(user)}
                className="flex w-16 flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    "rounded-full p-[3px]",
                    active && "shadow-[0_0_0_2px_var(--color-paper)]",
                  )}
                >
                  <Avatar
                    name={user.name}
                    color={user.avatarColor}
                    size={48}
                    decorative
                  />
                </span>
                <span
                  className={cn(
                    "text-caption w-full truncate text-center",
                    active ? "text-paper" : "text-rose",
                  )}
                >
                  {user.name?.trim() || "Без имени"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

// Демо-панель (DESIGN.md §8.10): режим, «Смотреть как», скорость ботов,
// задержки и ошибки API, перемотка времени, сброс и лента действий ботов.
// Кнопка видна, только когда в профиле включён «Режим демонстрации».
export const DemoPanel = () => {
  useBotLogFeed();
  const queryClient = useQueryClient();
  const demoMode = useDemoSettingsStore((state) => state.demoMode);
  const storedSettings = useDemoSettingsStore((state) => state.settings);
  const isLan = getMode() === "lan";
  // Настройки — через API: в lan они общие и живут на ноутбуке.
  const settingsQuery = useQuery({
    queryKey: demoKeys.settings(),
    queryFn: getDemoSettings,
    placeholderData: storedSettings,
  });
  const settings = settingsQuery.data ?? storedSettings;
  const presence = usePresence();
  const clockOffset = useClockOffset();
  const activeUserId = useSessionStore((state) => state.activeUserId);
  const entries = useBotLog((state) => state.entries);
  const leader = useSyncExternalStore(
    subscribeBotLeader,
    isBotLeader,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const loginDemo = useLoginDemo();
  const [hintsPending, setHintsPending] = useState(false);

  // «Показать обучение снова» (DESIGN.md §8.10): снимает deck_guide и
  // taste_toast — обучающая карточка снова первая.
  const showGuideAgain = () => {
    setHintsPending(true);
    resetDemoHints()
      .then(
        (user) => {
          queryClient.setQueryData(userKeys.me(), user);
          setOpen(false);
          router.push(ROUTES.GIFTS);
        },
        () =>
          toast("Не получилось. Попробуй ещё раз", {
            tone: "error",
          }),
      )
      .finally(() => setHintsPending(false));
  };

  if (!demoMode || !activeUserId) return null;

  const patch = (next: Partial<DemoSettings>) =>
    updateDemoSettings(next)
      .then(() => queryClient.invalidateQueries({ queryKey: demoKeys.all }))
      .catch(() => toast("Не получилось сохранить", { tone: "error" }));

  const today = formatDayMonth(toDateKey(clock.at(clockOffset)));

  return (
    <>
      {/* Язычок у правого края на 45% высоты, а не круг над таб-баром: внизу
          живут кнопки колоды и главные кнопки экранов, сверху — действия шапки.
          Видимая часть 18 px помещается в боковое поле экрана (20 px). Зона
          нажатия 24×56 — осознанное исключение из 44 px: кнопка только для
          ведущего демо, а широкая зона перехватывала «⋮» у желаний, «Голос»
          и поле даты у правого края (QA T20). */}
      <button
        type="button"
        aria-label="Демо-панель"
        onClick={() => setOpen(true)}
        className="bg-velvet-3 text-champagne border-line shadow-lift absolute top-[45%] right-0 z-[60] grid h-14 w-[18px] -translate-y-1/2 place-items-center rounded-l-[14px] border border-r-0 before:absolute before:inset-y-0 before:right-0 before:-left-[6px] before:content-['']"
      >
        <Sparkles aria-hidden size={14} strokeWidth={1.75} />
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Демо-панель"
        height="full"
      >
        <div className="flex flex-col gap-6 pb-4">
          <p className="text-caption text-rose flex items-center gap-2">
            <span aria-hidden className="bg-mint size-2 rounded-full" />
            {isLan
              ? `Локальная сеть: ${pluralize(presence.data?.devices ?? 0, ["устройство", "устройства", "устройств"])} онлайн`
              : `На этом устройстве: ${leader ? "боты работают в этой вкладке" : "боты — в другой вкладке"}`}
          </p>

          <WatchAs onPicked={() => setOpen(false)} />

          <section className="flex flex-col gap-3">
            <p className="text-label">Скорость ботов</p>
            {/* Чипы, а не сегменты: четыре подписи в узкой шторке не
                помещаются в одну дорожку. */}
            <div
              role="group"
              aria-label="Скорость ботов"
              className="flex flex-wrap gap-2"
            >
              {SPEEDS.map((speed) => (
                <Chip
                  key={speed.value}
                  selected={settings.botSpeed === speed.value}
                  onClick={() => void patch({ botSpeed: speed.value })}
                >
                  {speed.label}
                </Chip>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-1">
            <Switch
              label="Без задержек API"
              description="Ответы сразу, без 150–450 мс"
              checked={settings.noDelays}
              onChange={(noDelays) => void patch({ noDelays })}
            />
            <Switch
              label="Случайные ошибки"
              description="Каждый десятый запрос — ошибка связи"
              checked={settings.randomErrors}
              onChange={(randomErrors) => void patch({ randomErrors })}
            />
          </section>

          <section className="flex flex-col gap-3">
            <p className="text-label">
              Время в демо: <span className="text-paper">{today}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() =>
                  void patch({ clockOffsetMs: settings.clockOffsetMs + DAY })
                }
              >
                Перемотать на 1 день
              </Button>
              {settings.clockOffsetMs !== 0 && (
                <Button
                  variant="ghost"
                  onClick={() => void patch({ clockOffsetMs: 0 })}
                >
                  Вернуть часы
                </Button>
              )}
            </div>
          </section>

          <section>
            <p className="text-label mb-2">Лента событий</p>
            {entries.length === 0 ? (
              <p className="text-caption text-rose">
                Здесь появится, что сделали боты: например, «Азамат забронировал
                подарок».
              </p>
            ) : (
              <ul className="flex flex-col" aria-live="polite">
                {entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="border-line flex gap-3 border-b py-2 last:border-b-0"
                  >
                    <span className="text-caption text-rose w-11 flex-none tabular-nums">
                      {timeLabel(entry.at)}
                    </span>
                    <span className="text-body text-paper">{entry.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex flex-col gap-2">
            <Button
              variant="secondary"
              loading={hintsPending}
              onClick={showGuideAgain}
            >
              Показать обучение снова
            </Button>
            <Button
              variant="secondary"
              loading={loginDemo.isPending}
              onClick={() =>
                loginDemo.mutate(undefined, {
                  onSuccess: () => {
                    setOpen(false);
                    router.push(ROUTES.WISHLIST);
                  },
                  onError: () =>
                    toast("Не получилось войти. Попробуй ещё раз", {
                      tone: "error",
                    }),
                })
              }
            >
              Войти как демо-пользователь
            </Button>
          </div>
          <LoadNewYearButton network={isLan} onDone={() => setOpen(false)} />
          <ResetDemoButton label="Сбросить всё" network={isLan} />
        </div>
      </BottomSheet>
    </>
  );
};
