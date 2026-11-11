"use client";

import type { ButtonHTMLAttributes, Ref } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";
export type ButtonShape = "default" | "pill";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--accent-primary)] text-[var(--accent-foreground)] border border-[var(--accent-primary)] hover:bg-[var(--accent-hover)]",
  secondary:
    "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-subtle)] hover:border-[var(--border-strong)]",
  ghost:
    "bg-transparent text-[var(--text-primary)] border border-transparent hover:bg-[var(--bg-subtle)]",
  danger:
    "bg-[var(--danger-bg)] text-[var(--danger-fg)] border border-[var(--danger-bg)] hover:opacity-90",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-sm",
  md: "min-h-10 px-4 py-2 text-sm",
  lg: "min-h-11 px-5 py-2.5 text-base",
};

const SHAPE_CLASSES: Record<ButtonShape, string> = {
  default: "rounded-[var(--radius-md)]",
  pill: "rounded-full",
};

/**
 * Accessible button primitive adhering to Noka Light/Dark tokens.
 */
export function Button({
  variant = "primary",
  size = "md",
  shape = "default",
  type = "button",
  loading = false,
  disabled,
  className,
  children,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50",
        SHAPE_CLASSES[shape],
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

