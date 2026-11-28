"use client";

import { AppHeader } from "@/widgets/app-header";

import { isTelegramLoginEnabled } from "@/shared/api";
import { useAppMode } from "@/shared/lib/app-status";
import { Screen, ScreenBody, Skeleton } from "@/shared/ui";

import { privacyText } from "./privacy-model";

// «Что SwipeIt хранит» (auto-tasks-pm-4 S11): короткий честный экран для
// офиса — кто видит бронь и пару, как удалить всё. Открывается из профиля и
// из шторки имени, без профиля тоже (гость по приглашению). Без таб-бара.
// Живёт в слайсе профиля: слайсов pages — предел steiger (20).
export const PrivacyPage = () => {
  // Текст зависит от режима: он известен после запуска вкладки.
  const mode = useAppMode();
  const text = mode
    ? privacyText(mode, { telegram: isTelegramLoginEnabled() })
    : null;

  return (
    <Screen>
      <AppHeader title="Что SwipeIt хранит" showBack showAvatar={false} />
      <ScreenBody className="px-5 pt-2 pb-6">
        {!text ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : text.kind === "demo" ? (
          <p className="text-body text-paper">{text.text}</p>
        ) : (
          <>
            <h2 className="text-title-3 text-paper">{text.title}</h2>
            <ul className="mt-3 flex flex-col gap-2">
              {text.items.map((item) => (
                <li key={item} className="text-body text-paper flex gap-2">
                  <span aria-hidden className="text-rose flex-none">
                    —
                  </span>
                  <span className="min-w-0">{item}</span>
                </li>
              ))}
            </ul>
            <p className="text-body text-rose mt-5">{text.note}</p>
            <p className="text-body text-rose mt-3">{text.deleteNote}</p>
          </>
        )}
      </ScreenBody>
    </Screen>
  );
};
