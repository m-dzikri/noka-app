import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  if (typeof document !== "undefined") {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.removeAttribute("lang");
    document.cookie = "noka_locale=; Path=/; Max-Age=0";
    document.cookie = "noka_theme=; Path=/; Max-Age=0";
  }

  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear();
    } catch {
      // Ignore restricted storage cleanup errors.
    }
  }

  vi.restoreAllMocks();
});

