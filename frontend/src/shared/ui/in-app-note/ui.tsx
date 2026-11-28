"use client";

import { type ReactNode, useEffect, useState } from "react";

import { isTelegramLoginEnabled } from "@/shared/api";
import { REMOTE_COPY } from "@/shared/config";
import { copyText, useMounted } from "@/shared/lib/dom";
import {
  IN_APP_BROWSER_NAMES,
  type InAppBrowser,
  detectInAppBrowser,
} from "@/shared/lib/in-app-browser";
import { cn } from "@/shared/lib/utils";

import { Button } from "../button";
import { toast } from "../toast";

// Ключ сессии «уже показали». У приглашений в игру и план свой (R04):
// подсказку про бронь на чужом вишлисте человек мог видеть раньше, а про
// второе вступление — ещё нет.
const SHOWN_KEY = "swipeit:in-app-note";
export const IN_APP_JOIN_NOTE_KEY = "swipeit:in-app-note:join";

// Встроенный браузер мессенджера или null (Q08). До монтирования — null:
// в статическом HTML User-Agent неизвестен.
export const useInAppBrowser = (): InAppBrowser | null => {
  const mounted = useMounted();
  return mounted ? detectInAppBrowser(navigator.userAgent) : null;
};

// Отметить, что предупреждение уже показали в этой сессии: его видели на
// плашке гостя (X09), и шторка «Вишлист готов» его не повторит.
export const useMarkInAppNoteShown = (
  browser: InAppBrowser | null,
  sessionKey = SHOWN_KEY,
) => {
  useEffect(() => {
    if (!browser) return;
    try {
      window.sessionStorage.setItem(sessionKey, "1");
    } catch {
      // Без хранилища — просто показываем.
    }
  }, [browser, sessionKey]);
};

// «Скопировать ссылку» — адрес этой страницы, чтобы открыть его в Chrome или
// Safari.
export const copyPageLink = () =>
  void copyText(window.location.href).then((ok) =>
    toast(ok ? "Ссылка скопирована" : "Не получилось скопировать", {
      tone: ok ? "success" : "error",
    }),
  );

// Текст по умолчанию — про бронь и вишлист (Q08); экраны приглашений
// передают свой (R04).
const defaultText = (browser: InAppBrowser) =>
  `Ты в браузере ${IN_APP_BROWSER_NAMES[browser]} — бронь и вишлист сохранятся только здесь. Открой ссылку в Chrome или Safari, чтобы поставить приложение.`;

export const InAppBrowserText = ({
  browser,
  className,
  text = defaultText,
  tone = "paper",
}: {
  browser: InAppBrowser;
  className?: string;
  text?: (browser: InAppBrowser) => ReactNode;
  tone?: "paper" | "velvet";
}) => (
  <p
    className={cn(
      "text-caption",
      tone === "paper" ? "text-ink-soft" : "text-rose",
      className,
    )}
  >
    {text(browser)}
  </p>
);

// Подсказка во встроенном браузере мессенджера (auto-tasks-pm-2 Q08): бронь
// и вишлист сохранятся только здесь — открой ссылку в Chrome или Safari.
// Один раз за сессию; хранилище недоступно — показываем, как будто впервые.
export const InAppBrowserNote = ({
  className,
  sessionKey = SHOWN_KEY,
  text,
  tone = "paper",
}: {
  className?: string;
  // Свой ключ «уже показали» — для своего текста (R04).
  sessionKey?: string;
  text?: (browser: InAppBrowser) => ReactNode;
  // На бумаге (плашка гостя) или на бархате (шторка).
  tone?: "paper" | "velvet";
}) => {
  const detected = useInAppBrowser();
  // Впервые за сессию — решается один раз, при первом рендере.
  const [firstTime] = useState(() => {
    try {
      return !window.sessionStorage.getItem(sessionKey);
    } catch {
      return true;
    }
  });
  const browser = firstTime ? detected : null;
  useMarkInAppNoteShown(browser, sessionKey);
  if (!browser) return null;

  // Приглашение в игру или план, а вход через Telegram есть (S03): войти —
  // и игра откроется и в Chrome. Сам вход — в профиле.
  const telegramHint =
    sessionKey === IN_APP_JOIN_NOTE_KEY && isTelegramLoginEnabled();

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <InAppBrowserText browser={browser} text={text} tone={tone} />
      {telegramHint && (
        <InAppBrowserText
          browser={browser}
          text={() => REMOTE_COPY.telegramInAppHint}
          tone={tone}
        />
      )}
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "self-start",
          tone === "paper" ? "text-ink -ml-2" : "text-paper -ml-2",
        )}
        onClick={copyPageLink}
      >
        Скопировать ссылку
      </Button>
    </div>
  );
};
