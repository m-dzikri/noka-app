"use client";

import { useId, type InputHTMLAttributes, type Ref } from "react";
import { cn } from "@/lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  ref?: Ref<HTMLInputElement>;
}

/**
 * Accessible text input primitive with wired label, hint, and error state.
 */
export function Input({
  id,
  label,
  error,
  hint,
  className,
  ref,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-error`;
  const hintId = `${inputId}-hint`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[var(--text-primary)]"
        >
          {label}
        </label>
      ) : null}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          "min-h-10 w-full rounded-[var(--radius-md)] border bg-[var(--bg-surface)] px-3.5 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] transition-colors",
          error
            ? "border-[var(--status-expense)]"
            : "border-[var(--border-default)] focus:border-[var(--border-strong)]",
          className,
        )}
        {...props}
      />
      {hint && !error ? (
        <p id={hintId} className="text-xs text-[var(--text-muted)]">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-[var(--status-expense)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

