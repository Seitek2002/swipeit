"use client";

import { useEffect, useState } from "react";

import { copyText, useMounted } from "@/shared/lib/dom";
import {
  IN_APP_BROWSER_NAMES,
  detectInAppBrowser,
} from "@/shared/lib/in-app-browser";
import { cn } from "@/shared/lib/utils";

import { Button } from "../button";
import { toast } from "../toast";

const SHOWN_KEY = "swipeit:in-app-note";

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
  const mounted = useMounted();
  // Впервые за сессию — решается один раз, при первом рендере.
  const [firstTime] = useState(() => {
    try {
      return !window.sessionStorage.getItem(SHOWN_KEY);
    } catch {
      return true;
    }
  });
  const browser =
    mounted && firstTime ? detectInAppBrowser(navigator.userAgent) : null;
  useEffect(() => {
    if (!browser) return;
    try {
      window.sessionStorage.setItem(SHOWN_KEY, "1");
    } catch {
      // Без хранилища — просто показываем.
    }
  }, [browser]);
  if (!browser) return null;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <p
        className={cn(
          "text-caption",
          tone === "paper" ? "text-ink-soft" : "text-rose",
        )}
      >
        Ты в браузере {IN_APP_BROWSER_NAMES[browser]} — бронь и вишлист
        сохранятся только здесь. Открой ссылку в Chrome или Safari, чтобы
        поставить приложение.
      </p>
      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "self-start",
          tone === "paper" ? "text-ink -ml-2" : "text-paper -ml-2",
        )}
        onClick={() =>
          void copyText(window.location.href).then((ok) =>
            toast(ok ? "Ссылка скопирована" : "Не получилось скопировать", {
              tone: ok ? "success" : "error",
            }),
          )
        }
      >
        Скопировать ссылку
      </Button>
    </div>
  );
};
