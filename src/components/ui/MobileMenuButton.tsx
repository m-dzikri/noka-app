"use client";

import { forwardRef, useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/cn";

/**
 * Shared accessible mobile menu disclosure state with Escape focus restoration and outside dismissal.
 */
export function useMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        event.target instanceof Node &&
        !containerRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  return {
    isOpen,
    toggle: () => setIsOpen((prev) => !prev),
    close: () => setIsOpen(false),
    menuId,
    containerRef,
    buttonRef,
  };
}

export interface MobileMenuButtonProps {
  isOpen: boolean;
  controlsId: string;
  onToggle: () => void;
  className?: string;
}

/**
 * Touch-friendly hamburger toggle button for collapsible mobile header menus.
 */
export const MobileMenuButton = forwardRef<
  HTMLButtonElement,
  MobileMenuButtonProps
>(function MobileMenuButton({ isOpen, controlsId, onToggle, className }, ref) {
  const { t } = useI18n();
  const label = isOpen ? t.nav.closeMenuAriaLabel : t.nav.openMenuAriaLabel;

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={isOpen}
      aria-controls={controlsId}
      aria-label={label}
      title={label}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]",
        className,
      )}
    >
      {isOpen ? (
        <X className="h-5 w-5" aria-hidden="true" />
      ) : (
        <Menu className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
});

