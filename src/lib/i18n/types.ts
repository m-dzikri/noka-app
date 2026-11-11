export type Locale = "id" | "en";

export type Theme = "light" | "dark";

export interface PreferencesPatch {
  locale?: Locale;
  theme?: Theme;
}

export interface UpdatePreferencesOptions {
  persist?: boolean;
}

export type PersistPreferencesHandler = (
  patch: PreferencesPatch,
) => Promise<void> | void;

export interface Dictionary {
  common: {
    appName: string;
    tagline: string;
    loading: string;
    save: string;
    cancel: string;
    close: string;
    overviewHeading: string;
    overviewDescription: string;
    notesCardTitle: string;
    notesCardDescription: string;
    openNotes: string;
    financeCardTitle: string;
    financeCardDescription: string;
    openFinance: string;
    quickCapturePlaceholder: string;
    quickActionButton: string;
  };
  nav: {
    workspaceAriaLabel: string;
    mobileNavAriaLabel: string;
    notes: string;
    finance: string;
    settings: string;
    quickAction: string;
    skipToContent: string;
  };
  errors: {
    INVALID_JSON: string;
    INTERNAL_ERROR: string;
    VALIDATION_ERROR: string;
    IDEMPOTENCY_KEY_CONFLICT: string;
    INVALID_TIMESTAMP: string;
    DB_UNAVAILABLE: string;
    generic: string;
  };
  preferences: {
    themeToggleLabel: string;
    lightMode: string;
    darkMode: string;
    switchToLight: string;
    switchToDark: string;
    localeToggleLabel: string;
    indonesian: string;
    english: string;
    switchToId: string;
    switchToEn: string;
  };
  // Optional namespaces populated incrementally by RFC-002 through RFC-010 without stubs.
  auth?: Record<string, unknown>;
  landing?: Record<string, unknown>;
  notes?: Record<string, unknown>;
  folders?: Record<string, unknown>;
  finance?: Record<string, unknown>;
  privacy?: Record<string, unknown>;
  quickCapture?: Record<string, unknown>;
  linkedNotes?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

