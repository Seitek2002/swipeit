"use client";

import { useEffect, useState } from "react";

import { copyText, useMounted } from "@/shared/lib/dom";
import {
  IN_APP_BROWSER_NAMES,
  type InAppBrowser,
  detectInAppBrowser,
} from "@/shared/lib/in-app-browser";
import { cn } from "@/shared/lib/utils";

import { Button } from "../button";
import { toast } from "../toast";

const SHOWN_KEY = "swipeit:in-app-note";

// Встроенный браузер мессенджера или null (Q08). До монтирования — null:
// в статическом HTML User-Agent неизвестен.
export const useInAppBrowser = (): InAppBrowser | null => {
  const mounted = useMounted();
  return mounted ? detectInAppBrowser(navigator.userAgent) : null;
};

// Отметить, что предупреждение уже показали в этой сессии: его видели на
// плашке гостя (X09), и шторка «Вишлист готов» его не повторит.
export const useMarkInAppNoteShown = (browser: InAppBrowser | null) => {
  useEffect(() => {
    if (!browser) return;
    try {
      window.sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // Без хранилища — просто показываем.
    }
  }, [browser]);
};

// «Скопировать ссылку» — адрес этой страницы, чтобы открыть его в Chrome или
// Safari.
export const copyPageLink = () =>
  void copyText(window.location.href).then((ok) =>
    toast(ok ? "Ссылка скопирована" : "Не получилось скопировать", {
      tone: ok ? "success" : "error",
    }),
  );

export const InAppBrowserText = ({
  browser,
  className,
  tone = "paper",
}: {
  browser: InAppBrowser;
  className?: string;
  tone?: "paper" | "velvet";
}) => (
  <p
    className={cn(
      "text-caption",
      tone === "paper" ? "text-ink-soft" : "text-rose",
      className,
    )}
  >
    Ты в браузере {IN_APP_BROWSER_NAMES[browser]} — бронь и вишлист сохранятся
    только здесь. Открой ссылку в Chrome или Safari, чтобы поставить приложение.
  </p>
);

// Подсказка во встроенном браузере мессенджера (auto-tasks-pm-2 Q08): бронь
// и вишлист сохранятся только здесь — открой ссылку в Chrome или Safari.
// Один раз за сессию; хранилище недоступно — показываем, как будто впервые.
export const InAppBrowserNote = ({
  className,
  tone = "paper",
}: {
  className?: string;
  // На бумаге (плашка гостя) или на бархате (шторка).
  tone?: "paper" | "velvet";
}) => {
  const detected = useInAppBrowser();
  // Впервые за сессию — решается один раз, при первом рендере.
  const [firstTime] = useState(() => {
    try {
      return !window.sessionStorage.getItem(SHOWN_KEY);
    } catch {
      return true;
    }
  });
  const browser = firstTime ? detected : null;
  useMarkInAppNoteShown(browser);
  if (!browser) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <InAppBrowserText browser={browser} tone={tone} />
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
