"use client";

import { Suspense, useState } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { NAME_CAPTIONS, useRequireName } from "@/features/ask-name";

import {
  ExclusionList,
  PairSheet,
  SantaForm,
  type SantaPair,
  type SantaPerson,
  newSantaForm,
  pairsAmong,
  parseBudget,
  santaFormValid,
  withPair,
  withoutPair,
} from "@/entities/santa-game";
import { useFriends, useMe } from "@/entities/user";

import { createSantaGame, isApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock } from "@/shared/lib/clock";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  Button,
  ContentSkeleton,
  Screen,
  ScreenBody,
  toast,
} from "@/shared/ui";

import { DEMO_GAME_TITLE, demoFriendIds } from "./model";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

const Header = () => (
  <AppHeader
    title="Новая игра"
    showBack
    backHref={ROUTES.SANTA}
    showAvatar={false}
  />
);

// Новая игра Тайного Санты (DESIGN.md §8.8): поля игры (SantaForm — те же,
// что в «Изменить игру»), участники, исключения пар. ?demo=1 (Z05) — с
// названием и тремя отмеченными демо-друзьями.
const SantaCreate = () => {
  const router = useRouter();
  const demo = useSearchParams()?.get("demo") === "1";
  const { data: me } = useMe();
  const friends = useFriends();
  // На сервере друзья появляются, только когда открыли твою ссылку или
  // вступили в твою игру (BACKEND.md §4.3), — у нового профиля список пуст.
  const noFriends = friends.isSuccess && friends.data.length === 0;
  const [form, setForm] = useState(() => {
    const values = newSantaForm(clock.now());
    return demo ? { ...values, title: DEMO_GAME_TITLE } : values;
  });
  // null — в демо ещё не трогали: отмечены демо-друзья, когда список
  // загрузится. Первое нажатие делает выбор своим.
  const [picked, setPicked] = useState<null | string[]>(demo ? null : []);
  const invited = picked ?? demoFriendIds(friends.data ?? []);
  const setInvited = (update: (list: string[]) => string[]) =>
    setPicked((list) => update(list ?? invited));
  const [exclusions, setExclusions] = useState<SantaPair[]>([]);
  const [pairOpen, setPairOpen] = useState(false);

  const people: SantaPerson[] = [
    ...(me
      ? [{ id: me.id, name: me.name || "Ты", avatarColor: me.avatarColor }]
      : []),
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

  // Нет имени — NameSheet по «Создать игру» (DESIGN.md §8.8), потом игра
  // создаётся сама; NAME_REQUIRED от сервера — та же шторка и повтор.
  const requireName = useRequireName(NAME_CAPTIONS.santa);
  const create = useMutation({
    mutationFn: createSantaGame,
    onSuccess: (view) => router.replace(ROUTES.SANTA_GAME(view.game.id)),
    onError: (error, input) => {
      if (requireName.handleError(error, () => create.mutate(input))) return;
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось создать игру. Попробуй ещё раз",
        { tone: "error" },
      );
    },
  });

  // Исключения — только между теми, кто сейчас в игре.
  const activeExclusions = pairsAmong(exclusions, people);

  const submit = () => {
    const input = {
      title: form.title.trim(),
      budget: parseBudget(form.budget),
      exchangeDate: form.exchangeDate,
      drawMode: form.drawMode,
      drawAt:
        form.drawMode === "date"
          ? new Date(form.drawAt).toISOString()
          : undefined,
      participantIds: invited,
      exclusions: activeExclusions,
    };
    requireName.run(() => create.mutate(input));
  };

  return (
    <Screen>
      <Header />
      <ScreenBody className="px-5 pt-2 pb-6">
        <div className="flex flex-col gap-6">
          <SantaForm values={form} onChange={setForm} />

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
              {noFriends
                ? "Друзей здесь пока нет — позовёшь их ссылкой с экрана игры. Нужно хотя бы трое."
                : "Остальных позовёшь ссылкой с экрана игры. Нужно хотя бы трое."}
            </p>
          </section>

          <ExclusionList
            pairs={activeExclusions}
            nameOf={nameOf}
            addDisabled={people.length < 2}
            onAdd={() => setPairOpen(true)}
            onRemove={(pair) =>
              setExclusions((list) => withoutPair(list, pair))
            }
          />
        </div>
      </ScreenBody>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        <Button
          size="lg"
          className="w-full"
          disabled={!santaFormValid(form)}
          loading={create.isPending}
          onClick={submit}
        >
          Создать игру
        </Button>
      </div>
      <PairSheet
        open={pairOpen}
        people={people}
        exclusions={activeExclusions}
        onClose={() => setPairOpen(false)}
        onAdd={(pair) => {
          setExclusions((list) => withPair(list, pair));
          setPairOpen(false);
        }}
      />
      {requireName.sheet}
    </Screen>
  );
};

// useSearchParams в статической сборке — только под Suspense.
export const SantaCreatePage = () => (
  <Suspense
    fallback={
      <Screen>
        <Header />
        <ScreenBody className="px-5 pt-2">
          <ContentSkeleton />
        </ScreenBody>
      </Screen>
    }
  >
    <SantaCreate />
  </Suspense>
);
