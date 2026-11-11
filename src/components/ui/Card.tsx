import type { HTMLAttributes } from "react";
import { cn } from "@/lib/cn";

/**
 * Surface container card following Noka subtle border and whitespace tokens.
 */
export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-sm)]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1", className)} {...props} />;
}

type CardTitleHeading = "h1" | "h2" | "h3";

interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  as?: CardTitleHeading;
}

export function CardTitle({
  as: Heading = "h2",
  className,
  ...props
}: CardTitleProps) {
  return (
    <Heading
      className={cn("text-lg font-semibold text-[var(--text-primary)]", className)}
      {...props}
    />
  );
}

export function CardDescription({
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("text-sm text-[var(--text-secondary)]", className)}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("text-sm text-[var(--text-primary)]", className)} {...props} />;
}

export function CardFooter({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-4 flex flex-wrap items-center gap-1.5", className)} {...props} />;
}

