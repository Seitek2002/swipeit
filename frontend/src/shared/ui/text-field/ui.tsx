"use client";

import { type ComponentProps, useId } from "react";

import { cn } from "@/shared/lib/utils";

type FieldProps = {
  error?: string;
  hint?: string;
  label?: string;
};

const fieldBase =
  "bg-velvet-3 text-paper placeholder:text-rose/60 focus-visible:border-mandarin w-full rounded-field border-[1.5px] border-transparent px-4 text-[17px] leading-[22px] outline-none transition-colors duration-200";

const FieldShell = ({
  id,
  label,
  hint,
  error,
  counter,
  children,
}: FieldProps & {
  children: React.ReactNode;
  counter?: string;
  id: string;
}) => (
  <div className="flex flex-col gap-2">
    {(label || counter) && (
      <div className="flex items-baseline justify-between gap-3">
        {label && (
          <label htmlFor={id} className="text-caption text-rose">
            {label}
          </label>
        )}
        {counter && (
          <span className="text-caption text-rose tabular-nums">{counter}</span>
        )}
      </div>
    )}
    {children}
    {error ? (
      <p id={`${id}-error`} className="text-caption text-pomegranate">
        {error}
      </p>
    ) : (
      hint && (
        <p id={`${id}-hint`} className="text-caption text-rose">
          {hint}
        </p>
      )
    )}
  </div>
);

type TextFieldProps = Omit<ComponentProps<"input">, "id"> & FieldProps;

// Поле ввода (reference.html, .field): 52px, бархат-3, фокус — мандариновая
// рамка, ошибка — гранатовая рамка и текст под полем.
export const TextField = ({
  label,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) => {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error}>
      <input
        id={id}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={cn(
          fieldBase,
          "h-[52px]",
          error && "border-pomegranate",
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
};

type TextAreaProps = Omit<ComponentProps<"textarea">, "id"> & FieldProps;

// Многострочное поле: заметка к желанию, сообщение к вишлисту. Если задан
// maxLength — справа над полем живой счётчик символов.
export const TextArea = ({
  label,
  hint,
  error,
  className,
  maxLength,
  value,
  ...props
}: TextAreaProps) => {
  const id = useId();
  const length = typeof value === "string" ? value.length : 0;
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      counter={maxLength ? `${length} / ${maxLength}` : undefined}
    >
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={
          error ? `${id}-error` : hint ? `${id}-hint` : undefined
        }
        className={cn(
          fieldBase,
          "min-h-24 resize-none py-3.5",
          error && "border-pomegranate",
          className,
        )}
        {...props}
      />
    </FieldShell>
  );
};
