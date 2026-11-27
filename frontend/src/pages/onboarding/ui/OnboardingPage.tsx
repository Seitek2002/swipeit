"use client";

import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

import { ChevronLeft } from "lucide-react";

import {
  AudiencePicker,
  AvatarColorPicker,
  BirthdayPicker,
  EMPTY_DRAFT,
  InterestsPicker,
  MIN_INTERESTS,
  NAME_MAX,
  type ProfileDraft,
  toProfileInput,
  validateProfile,
} from "@/features/profile-form";

import { useCreateUser, useLoginDemo, useMe } from "@/entities/user";

import { ROUTES } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import { takeReturnTo } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";
import {
  Brand,
  Button,
  IconButton,
  ProgressDots,
  Screen,
  ScreenBody,
  TextField,
  toast,
} from "@/shared/ui";

import { HangingTags } from "./HangingTags";
import { LanPlaque } from "./LanPlaque";

type Step = "interests" | "name" | "welcome";

const STEP_INDEX: Record<Step, number> = { welcome: 0, name: 1, interests: 2 };

const Footer = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-none flex-col gap-2 px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+16px)]">
    {children}
  </div>
);

// Онбординг (DESIGN.md §8.1): 3 шага, одна кнопка на шаг. Шаг держит
// родитель, шаги только рисуют (как в imbir, CODESTYLE §7).
export const OnboardingPage = () => {
  const router = useRouter();
  const me = useMe();
  const createUser = useCreateUser();
  const loginDemo = useLoginDemo();
  const [step, setStep] = useState<Step>("welcome");
  // Приветствие рисуется до запуска вкладки — уже в статическом HTML
  // (shared/config rendersBeforeReady). Режим до запуска неизвестен, а
  // транспорт не выбран: входы, которые пишут в API, ждут готовности.
  const mode = useAppMode();
  const ready = mode !== null;
  // Куда вести после знакомства (приглашение в план и т. п.). Забираем один
  // раз при открытии: навигаций несколько, и вторая получила бы пустоту.
  const [afterOnboarding] = useState(() => takeReturnTo() ?? ROUTES.GIFTS);
  const [draft, setDraft] = useState<ProfileDraft>(EMPTY_DRAFT);
  const [nameTouched, setNameTouched] = useState(false);

  const errors = validateProfile(draft);
  const isBusy = createUser.isPending || loginDemo.isPending;

  // Профиль уже есть (вернулись назад браузером) — сразу в ленту.
  useEffect(() => {
    if (me.data && !createUser.isPending) router.replace(afterOnboarding);
  }, [me.data, createUser.isPending, router, afterOnboarding]);

  const update = (patch: Partial<ProfileDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleDemo = () => {
    if (!ready) return;
    loginDemo.mutate(undefined, {
      onSuccess: () => router.replace(afterOnboarding),
      onError: () =>
        toast("Не получилось войти. Попробуй ещё раз", { tone: "error" }),
    });
  };

  const handleNameNext = () => {
    setNameTouched(true);
    if (errors.name || errors.birthday) return;
    setStep("interests");
  };

  const handleFinish = () => {
    if (!ready || Object.keys(errors).length > 0) return;
    createUser.mutate(toProfileInput(draft), {
      onSuccess: () => router.replace(afterOnboarding),
      onError: () =>
        toast("Не получилось сохранить. Попробуй ещё раз", { tone: "error" }),
    });
  };

  if (step === "welcome") {
    return (
      <Screen>
        <div className="max-h-[380px] min-h-[180px] flex-1">
          <HangingTags />
        </div>
        <div className="flex-none px-6 pt-4">
          <Brand />
          <h1 className="text-title-1 mt-[22px] max-w-[19ch]">
            Свайпай подарки, которые хочешь сам.
          </h1>
          <p className="text-body-lg text-rose mt-2.5">
            Друзья увидят — и угадают с подарком.
          </p>
          <LanPlaque />
        </div>
        <Footer>
          <div className="flex flex-col gap-1 pt-4">
            <Button size="lg" onClick={() => setStep("name")} disabled={isBusy}>
              Начать
            </Button>
            <Button
              size="lg"
              variant="ghost"
              loading={loginDemo.isPending}
              disabled={!ready}
              onClick={handleDemo}
            >
              Войти как демо-пользователь
            </Button>
          </div>
          {/* До запуска режим неизвестен: место под подпись держим (без
              сдвига вёрстки), а текст показываем, когда ясно, какой он. */}
          <p
            className={cn(
              "text-caption text-rose px-2 text-center",
              !ready && "invisible",
            )}
          >
            {mode === "lan"
              ? "Это демо в локальной сети: данные хранятся на ноутбуке ведущего"
              : "Это демо: всё хранится только в твоём браузере, а друзья внутри — демо-боты"}
          </p>
        </Footer>
      </Screen>
    );
  }

  return (
    <Screen>
      <div className="flex h-14 flex-none items-center justify-between pr-5 pl-2">
        <IconButton
          label="Назад"
          onClick={() => setStep(step === "interests" ? "name" : "welcome")}
        >
          <ChevronLeft aria-hidden size={24} strokeWidth={1.75} />
        </IconButton>
        <ProgressDots
          count={3}
          current={STEP_INDEX[step]}
          label="Шаги знакомства"
        />
      </div>

      {step === "name" ? (
        <>
          <ScreenBody className="flex flex-col gap-6 px-5 pt-2">
            <h1 className="text-title-1">Как тебя зовут?</h1>
            <TextField
              label="Имя"
              placeholder="Имя"
              autoFocus
              autoComplete="given-name"
              maxLength={NAME_MAX}
              value={draft.name}
              error={nameTouched ? errors.name : undefined}
              onChange={(event) => update({ name: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleNameNext();
              }}
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
          </ScreenBody>
          <Footer>
            <Button
              size="lg"
              onClick={handleNameNext}
              disabled={!draft.name.trim()}
            >
              Дальше
            </Button>
          </Footer>
        </>
      ) : (
        <>
          <ScreenBody className="flex flex-col gap-6 px-5 pt-2">
            <div>
              <h1 className="text-title-1">Что тебе нравится?</h1>
              <p className="text-body text-rose mt-2">
                Выбери хотя бы {MIN_INTERESTS} — по ним подберём подарки.
              </p>
            </div>
            <InterestsPicker
              value={draft.interests}
              onChange={(interests) => update({ interests })}
            />
            <AudiencePicker
              value={draft.audience}
              onChange={(audience) => update({ audience })}
            />
          </ScreenBody>
          <Footer>
            <Button
              size="lg"
              onClick={handleFinish}
              loading={createUser.isPending}
              disabled={!ready || draft.interests.length < MIN_INTERESTS}
            >
              Показать подарки
            </Button>
          </Footer>
        </>
      )}
    </Screen>
  );
};
