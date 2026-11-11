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

export interface LandingFeatureItem {
  title: string;
  description: string;
}

export interface LandingQuickCapturePreset {
  id: "expense" | "income" | "note";
  chip: string;
  kindLabel: string;
  categoryLabel: string;
  walletLabel?: string;
  amountSign?: "positive" | "negative" | "neutral";
  amountText?: string;
  noteTitle?: string;
  hintText: string;
}

export interface LandingChecklistItem {
  id: string;
  label: string;
}

export interface LandingDictionary {
  seoTitle: string;
  seoDescription: string;
  header: {
    primaryNavAriaLabel: string;
    openWorkspace: string;
    signIn: string;
    signUp: string;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    primaryGuestCta: string;
    secondaryGuestCta: string;
    primaryAuthCta: string;
    secondaryAuthCta: string;
    trustLine: string;
  };
  preview: {
    sectionTitle: string;
    sectionSubtitle: string;
    quickCaptureLabel: string;
    quickCaptureHint: string;
    detectedHeading: string;
    checklistHeading: string;
    safeToSpendTitle: string;
    safeToSpendVisibleAmount: string;
    safeToSpendSuffix: string;
    safeToSpendSubtext: string;
    linkedNotesTitle: string;
    linkedNotesDetailPrefix: string;
    linkedNotesVisibleAmount: string;
    privacyBlurButtonShow: string;
    privacyBlurButtonHide: string;
    privacyBlurHint: string;
    presets: [
      LandingQuickCapturePreset,
      LandingQuickCapturePreset,
      LandingQuickCapturePreset,
    ];
    checklistItems: [
      LandingChecklistItem,
      LandingChecklistItem,
      LandingChecklistItem,
    ];
  };
  features: {
    sectionTitle: string;
    sectionSubtitle: string;
    items: [
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
      LandingFeatureItem,
    ];
  };
  footer: {
    privacyHeading: string;
    privacyPoints: [string, string, string];
    copyright: string;
  };
}

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
    openMenuAriaLabel: string;
    closeMenuAriaLabel: string;
    mobileMenuAriaLabel: string;
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
    CSRF_ORIGIN_MISMATCH: string;
    EMAIL_ALREADY_EXISTS: string;
    INVALID_CREDENTIALS: string;
    UNAUTHORIZED: string;
    RATE_LIMITED: string;
    MAIL_DELIVERY_UNAVAILABLE: string;
    INVALID_OR_EXPIRED_TOKEN: string;
    NOT_FOUND: string;
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
  auth: {
    backToHome: string;
    loginTitle: string;
    loginSubtitle: string;
    registerTitle: string;
    registerSubtitle: string;
    forgotPasswordTitle: string;
    forgotPasswordSubtitle: string;
    resetPasswordTitle: string;
    resetPasswordSubtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    passwordHint: string;
    confirmPasswordLabel: string;
    confirmPasswordPlaceholder: string;
    newPasswordLabel: string;
    confirmNewPasswordLabel: string;
    loginButton: string;
    loggingInButton: string;
    registerButton: string;
    registeringButton: string;
    forgotPasswordLink: string;
    noAccountPrompt: string;
    createAccountLink: string;
    hasAccountPrompt: string;
    signInLink: string;
    sendResetLinkButton: string;
    sendingResetLinkButton: string;
    resetPasswordButton: string;
    resettingPasswordButton: string;
    backToLoginLink: string;
    requestNewLink: string;
    logoutButton: string;
    loggingOutButton: string;
    nameRequiredError: string;
    emailInvalidError: string;
    passwordTooShortError: string;
    passwordMismatchError: string;
    forgotPasswordGenericSuccess: string;
    forgotPasswordGenericApiMessage: string;
    resetPasswordSuccess: string;
    resetTokenMissingError: string;
    rateLimitedRetryMessage: string;
    forgotPasswordEmailSubject: string;
    forgotPasswordEmailHeading: string;
    forgotPasswordEmailIntro: string;
    forgotPasswordEmailAction: string;
    forgotPasswordEmailExpiry: string;
    forgotPasswordEmailIgnore: string;
  };
  categories: {
    food_drink: string;
    transport: string;
    shopping: string;
    bills: string;
    entertainment: string;
    health: string;
    education: string;
    other_expense: string;
    salary: string;
    bonus: string;
    refund: string;
    other_income: string;
  };
  // Strongly typed landing page & SEO dictionary populated in RFC-003.
  landing: LandingDictionary;
  // Optional namespaces populated incrementally by RFC-004 through RFC-010 without stubs.
  notes?: Record<string, unknown>;
  folders?: Record<string, unknown>;
  finance?: Record<string, unknown>;
  privacy?: Record<string, unknown>;
  quickCapture?: Record<string, unknown>;
  linkedNotes?: Record<string, unknown>;
  sync?: Record<string, unknown>;
  settings?: Record<string, unknown>;
}

