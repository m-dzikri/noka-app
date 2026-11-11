import type { Dictionary } from "@/lib/i18n/types";

export const enDictionary: Dictionary = {
  common: {
    appName: "Noka",
    tagline: "Light as a Notepad, Tidy as a Ledger.",
    loading: "Loading...",
    save: "Save",
    cancel: "Cancel",
    close: "Close",
    overviewHeading: "Welcome to Noka",
    overviewDescription:
      "Organize Markdown notes, daily checklists, and multi-wallet IDR finances from one lightweight workspace.",
    notesCardTitle: "Notes Workspace",
    notesCardDescription:
      "Write fast notes, organize folders, check off GFM tasks, and find anything instantly.",
    openNotes: "Open Notes",
    financeCardTitle: "Finance Workspace",
    financeCardDescription:
      "Track IDR wallet balances, log income or expenses, and record transfers cleanly.",
    openFinance: "Open Finance",
    quickCapturePlaceholder: "Type a quick note or expense...",
    quickActionButton: "Capture",
  },
  nav: {
    workspaceAriaLabel: "Workspace navigation",
    mobileNavAriaLabel: "Mobile navigation",
    notes: "Notes",
    finance: "Finance",
    settings: "Settings",
    quickAction: "Quick Capture",
    skipToContent: "Skip to main content",
  },
  errors: {
    INVALID_JSON: "Malformed JSON request payload.",
    INTERNAL_ERROR: "An internal server error occurred. Please try again.",
    VALIDATION_ERROR: "Request validation failed.",
    IDEMPOTENCY_KEY_CONFLICT:
      "Idempotency key was already used with a different request payload.",
    INVALID_TIMESTAMP: "Invalid update timestamp format.",
    DB_UNAVAILABLE: "Database service is temporarily unavailable.",
    generic: "Unable to process request.",
  },
  preferences: {
    themeToggleLabel: "Toggle display theme",
    lightMode: "Light",
    darkMode: "Dark",
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    localeToggleLabel: "Toggle application language",
    indonesian: "ID",
    english: "EN",
    switchToId: "Switch to Indonesian",
    switchToEn: "Switch to English",
  },
};

