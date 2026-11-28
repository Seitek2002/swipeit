"use client";

import { useEffect, useState } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronRight } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { ResetDemoButton } from "@/features/demo-reset";
import { MyDates } from "@/features/important-dates";
import {
  AvatarColorPicker,
  NAME_MAX,
  type ProfileDraft,
  draftFromUser,
  toProfileInput,
  validateProfile,
} from "@/features/profile-form";
import { TasteEdit } from "@/features/taste-edit";

import {
  type User,
  readOwnUserId,
  useFriends,
  useLoginDemo,
  useMe,
  useReturnToOwnUser,
  useUpdateMe,
} from "@/entities/user";
import { useGivingCount } from "@/entities/wishlist";

import {
  AUDIENCES,
  AUDIENCE_LABELS,
  type Audience,
  ROUTES,
} from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import { plural } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useDemoSettingsStore, useGiftFiltersStore } from "@/shared/store";
import {
  Avatar,
  Button,
  ConfirmDialog,
  Screen,
  ScreenBody,
  SegmentedControl,
  Skeleton,
  Switch,
  TextField,
  toast,
} from "@/shared/ui";

import { AccountActions } from "./account-actions";

// Профиль (DESIGN.md §8.9, quick-start.html кадр 7): имя и аватар,
// «Мои даты», «Мне нравится», «Показывать подарки», «Друзья», «Режим демонстрации»,
// «Сбросить демо-данные». В remote вместо демо-кнопок — «Выйти» и «Удалить
// профиль» (BACKEND.md §3.4).
export const ProfilePage = () => {
  const me = useMe();

  return (
    <Screen>
      <AppHeader title="Профиль" showBack showAvatar={false} />
      <ScreenBody className="px-5 pt-2">
        {me.data ? (
          // key: другой пользователь вкладки — форма заново из его данных.
          <ProfileForm key={me.data.id} user={me.data} />
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="size-16 rounded-full" />
            <Skeleton className="h-[52px]" />
            <Skeleton className="h-[52px]" />
          </div>
        )}
      </ScreenBody>
    </Screen>
  );
};

// Якорь «Мне нравится»: кнопка «Поправить» в тосте «Подстроили ленту под
// твои „Хочу“» ведёт на /profile/#likes (TASKS T23).
const LIKES_ANCHOR = "likes";

// Next сам прокручивает к #якорю при переходе, но раздел появляется позже —
// когда загрузился профиль. Поэтому прокручиваем, когда форма смонтирована.
const useScrollToHash = () => {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "start" });
  }, []);
};

// «Показывать подарки» (DESIGN.md §8.9) — то же значение, что в шторке
// фильтров ленты: один стор gift-filters, а не поле профиля. Меняется сразу.
const AudienceSection = () => {
  const filters = useGiftFiltersStore((state) => state.filters);
  const setFilters = useGiftFiltersStore((state) => state.setFilters);
  const value: Audience = filters.audience ?? "all";

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-label text-paper mb-1">Показывать подарки</h2>
      <SegmentedControl
        label="Показывать подарки"
        value={value}
        onChange={(audience) =>
          // «всем» храним отсутствием поля — так же читаются старые фильтры
          // и ссылки (TECH_SPEC §5 ProductFilters.audience).
          setFilters({
            ...filters,
            audience: audience === "all" ? undefined : audience,
          })
        }
        options={AUDIENCES.map((audience) => ({
          value: audience,
          label: AUDIENCE_LABELS[audience],
        }))}
      />
    </section>
  );
};

const sameDraft = (a: ProfileDraft, b: ProfileDraft) =>
  JSON.stringify(a) === JSON.stringify(b);

const ProfileForm = ({ user }: { user: User }) => {
  const updateMe = useUpdateMe();
  const loginDemo = useLoginDemo();
  const returnToOwn = useReturnToOwnUser();
  const router = useRouter();
  // Перед входом демо-пользователем — подтверждение (V03): вход молча уводил
  // из своего профиля. Свой профиль — для «Вернуться в свой профиль».
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [ownUserId] = useState(readOwnUserId);
  const canReturn = Boolean(ownUserId && ownUserId !== user.id);
  const friends = useFriends();
  const remote = useAppMode() === "remote";
  const demoMode = useDemoSettingsStore((state) => state.demoMode);
  const setDemoMode = useDemoSettingsStore((state) => state.setDemoMode);
  const [saved, setSaved] = useState(() => draftFromUser(user));
  const [draft, setDraft] = useState(saved);
  useScrollToHash();

  const errors = validateProfile(draft, Boolean(user.name?.trim()));
  const isDirty = !sameDraft(draft, saved);
  const hasErrors = Object.keys(errors).length > 0;
  const friendCount = friends.data?.length ?? 0;
  // «· я дарю 1» у ссылки «Друзья» (W04): там раздел «Я дарю».
  const giving = useGivingCount();

  const update = (patch: Partial<ProfileDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleSave = () => {
    if (hasErrors) return;
    updateMe.mutate(toProfileInput(draft), {
      onSuccess: (next) => {
        const fresh = draftFromUser(next);
        setSaved(fresh);
        setDraft(fresh);
        toast("Профиль сохранён");
      },
      onError: () =>
        toast("Не получилось сохранить. Попробуй ещё раз", { tone: "error" }),
    });
  };

  return (
    <div className={cn("flex flex-col gap-6 pb-6", isDirty && "pb-24")}>
      <div className="flex items-center gap-4">
        <Avatar
          name={draft.name.trim() || (user.name ?? "")}
          color={draft.avatarColor}
          size={64}
        />
        <p className="text-title-2 min-w-0 truncate">
          {draft.name.trim() || user.name}
        </p>
      </div>

      <TextField
        label="Имя"
        placeholder="Как тебя зовут?"
        maxLength={NAME_MAX}
        value={draft.name}
        error={errors.name}
        hint={
          draft.name.trim()
            ? undefined
            : "Нужно, когда отправляешь вишлист или зовёшь друзей"
        }
        onChange={(event) => update({ name: event.target.value })}
      />
      <div className="flex flex-col gap-2">
        <p className="text-caption text-rose">Цвет аватара</p>
        <AvatarColorPicker
          name={draft.name}
          value={draft.avatarColor}
          onChange={(avatarColor) => update({ avatarColor })}
        />
      </div>
      {/* «Мои даты» и «Мне нравится» сохраняются сразу, без «Сохранить»:
          «Сохранить» отправляет только имя и фон аватара (TASKS T24). */}
      <MyDates />
      <TasteEdit id={LIKES_ANCHOR} />
      <AudienceSection />

      {isDirty && (
        // Липкий футер над таб-баром (reference.html, .sticky-foot): поля
        // правят сверху, а кнопка должна быть видна сразу, не в конце списка.
        <div className="from-velvet pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-60% to-transparent px-5 pt-7 pb-[calc(var(--tabbar-space)-8px)]">
          <Button
            size="lg"
            className="pointer-events-auto"
            onClick={handleSave}
            loading={updateMe.isPending}
            disabled={hasErrors}
          >
            Сохранить
          </Button>
        </div>
      )}

      <div className="border-line flex flex-col border-t pt-2">
        <Link
          href={ROUTES.FRIENDS}
          className="border-line flex min-h-14 items-center gap-3 border-b"
        >
          <span className="text-body text-paper flex-1">Друзья</span>
          {(friendCount > 0 || giving > 0) && (
            <span className="text-caption text-rose">
              {[
                friendCount > 0 &&
                  `${friendCount} ${plural(friendCount, ["друг", "друга", "друзей"])}`,
                giving > 0 && `я дарю ${giving}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          )}
          <ChevronRight
            aria-hidden
            size={20}
            strokeWidth={1.75}
            className="text-rose"
          />
        </Link>
        {remote ? (
          <AccountActions />
        ) : (
          <>
            <Switch
              className="border-line border-b py-3"
              label="Режим демонстрации"
              description="Кнопка демо-панели: «Смотреть как», скорость ботов, перемотка времени"
              checked={demoMode}
              onChange={setDemoMode}
            />
            <ResetDemoButton className="mt-3 self-start px-0" />
            {/* Готовая Айгерим с вишлистом (DESIGN.md §8.1) — бывшая кнопка
              первого экрана. */}
            {canReturn && ownUserId ? (
              <Button
                variant="secondary"
                className="mt-3"
                onClick={() => {
                  returnToOwn(ownUserId);
                  router.push(ROUTES.WISHLIST);
                }}
              >
                Вернуться в свой профиль
              </Button>
            ) : (
              <Button
                variant="secondary"
                className="mt-3"
                loading={loginDemo.isPending}
                onClick={() => setConfirmDemo(true)}
              >
                Войти как демо-пользователь
              </Button>
            )}
            <ConfirmDialog
              open={confirmDemo}
              onClose={() => setConfirmDemo(false)}
              isLoading={loginDemo.isPending}
              title="Войти как Айгерим?"
              description="Твой профиль и вишлист сохранятся. Вернуться — здесь же, в профиле: «Вернуться в свой профиль»."
              confirmLabel="Войти"
              onConfirm={() =>
                loginDemo.mutate(undefined, {
                  onSuccess: () => {
                    setConfirmDemo(false);
                    router.push(ROUTES.WISHLIST);
                  },
                  onError: () =>
                    toast("Не получилось войти. Попробуй ещё раз", {
                      tone: "error",
                    }),
                })
              }
            />
          </>
        )}
        {/* «Что SwipeIt хранит» (S11) — сразу под «Удалить профиль» (в демо —
            под сбросом). Фото занятий — под CC BY и CC BY-SA: авторы
            обязательны (DESIGN.md §8.9). Ссылки мелкие, в одну строку, а
            зона нажатия — ≥ 44 px за счёт псевдоэлемента: сверху до кнопки
            остаётся зазор, друг друга они не перекрывают. */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-4">
          <Link
            href={ROUTES.PRIVACY}
            className="text-caption text-rose relative underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-['']"
          >
            Что SwipeIt хранит
          </Link>
          <Link
            href={ROUTES.CREDITS}
            className="text-caption text-rose relative underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-['']"
          >
            Авторы фото
          </Link>
        </div>
      </div>
    </div>
  );
};
