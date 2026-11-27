"use client";

import { useState } from "react";

import Link from "next/link";

import { ChevronRight } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import { ResetDemoButton } from "@/features/demo-reset";
import {
  AudiencePicker,
  AvatarColorPicker,
  BirthdayPicker,
  InterestsPicker,
  NAME_MAX,
  type ProfileDraft,
  draftFromUser,
  toProfileInput,
  validateProfile,
} from "@/features/profile-form";

import { type User, useFriends, useMe, useUpdateMe } from "@/entities/user";

import { ROUTES } from "@/shared/config";
import { plural } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useDemoSettingsStore } from "@/shared/store";
import {
  Avatar,
  Button,
  Screen,
  ScreenBody,
  Skeleton,
  Switch,
  TextField,
  toast,
} from "@/shared/ui";

// Профиль (DESIGN.md §8.9): те же поля, что в онбординге, «Друзья»,
// «Режим демонстрации» и «Сбросить демо-данные».
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

const sameDraft = (a: ProfileDraft, b: ProfileDraft) =>
  JSON.stringify(a) === JSON.stringify(b);

const ProfileForm = ({ user }: { user: User }) => {
  const updateMe = useUpdateMe();
  const friends = useFriends();
  const demoMode = useDemoSettingsStore((state) => state.demoMode);
  const setDemoMode = useDemoSettingsStore((state) => state.setDemoMode);
  const [saved, setSaved] = useState(() => draftFromUser(user));
  const [draft, setDraft] = useState(saved);

  const errors = validateProfile(draft);
  const isDirty = !sameDraft(draft, saved);
  const hasErrors = Object.keys(errors).length > 0;
  const friendCount = friends.data?.length ?? 0;

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
        maxLength={NAME_MAX}
        value={draft.name}
        error={errors.name}
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
      <BirthdayPicker
        day={draft.birthdayDay}
        month={draft.birthdayMonth}
        error={errors.birthday}
        onChange={({ day, month }) =>
          update({ birthdayDay: day, birthdayMonth: month })
        }
      />
      <div className="flex flex-col gap-2">
        <p className="text-caption text-rose">Интересы</p>
        <InterestsPicker
          value={draft.interests}
          onChange={(interests) => update({ interests })}
        />
      </div>
      <AudiencePicker
        value={draft.audience}
        onChange={(audience) => update({ audience })}
      />

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
          {friendCount > 0 && (
            <span className="text-caption text-rose">
              {friendCount} {plural(friendCount, ["друг", "друга", "друзей"])}
            </span>
          )}
          <ChevronRight
            aria-hidden
            size={20}
            strokeWidth={1.75}
            className="text-rose"
          />
        </Link>
        <Switch
          className="border-line border-b py-3"
          label="Режим демонстрации"
          description="Кнопка демо-панели: «Смотреть как», скорость ботов, перемотка времени"
          checked={demoMode}
          onChange={setDemoMode}
        />
        <ResetDemoButton className="mt-3 self-start px-0" />
        {/* Фото занятий — под CC BY и CC BY-SA: авторы обязательны (DESIGN.md §8.9).
            Ссылка мелкая, а зона нажатия — ≥ 44 px за счёт псевдоэлемента:
            сверху до кнопки сброса остаётся зазор, соседей она не перекрывает. */}
        <Link
          href={ROUTES.CREDITS}
          className="text-caption text-rose relative mt-4 self-start underline underline-offset-2 before:absolute before:-inset-x-2 before:-inset-y-3.5 before:content-['']"
        >
          Авторы фото
        </Link>
      </div>
    </div>
  );
};
