"use client";

import { copyText } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";

import { toast } from "../toast/model";

type Props = {
  className?: string;
  code: string;
};

// «код a1b2c3d4» мелким текстом после фразы об ошибке (S08): по нажатию —
// копирование и тост «Код скопирован». Человек отправит код владельцу, тот
// найдёт сбой в логах сервера.
export const ErrorCode = ({ code, className }: Props) => (
  <button
    type="button"
    aria-label={`Скопировать код ошибки ${code}`}
    onClick={() => {
      void copyText(code).then((ok) =>
        toast(ok ? "Код скопирован" : `Код ошибки: ${code}`, {
          tone: ok ? "success" : "info",
        }),
      );
    }}
    className={cn(
      "text-caption relative font-normal whitespace-nowrap opacity-70 before:absolute before:-inset-2 before:content-['']",
      className,
    )}
  >
    код {code}
  </button>
);
