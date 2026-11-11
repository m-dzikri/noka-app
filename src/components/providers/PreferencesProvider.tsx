"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  DICTIONARIES,
  I18nContext,
  PreferencesContext,
} from "@/lib/i18n/context";
import type {
  Locale,
  PersistPreferencesHandler,
  PreferencesPatch,
  Theme,
  UpdatePreferencesOptions,
} from "@/lib/i18n/types";

const LOCALE_KEY = "noka_locale";
const THEME_KEY = "noka_theme";
const COOKIE_MAX_AGE_SECONDS = 31_536_000;

interface PreferencesProviderProps {
  initialLocale: Locale;
  initialTheme: Theme;
  hasCookieLocale?: boolean;
  hasCookieTheme?: boolean;
  children: ReactNode;
}

function syncDocumentAttributes(locale: Locale, theme: Theme): void {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = locale;
}

function writeClientPersistence(locale: Locale, theme: Theme): void {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(LOCALE_KEY, locale);
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore storage access errors in restricted private browsing modes.
    }
  }
  if (typeof document !== "undefined") {
    document.cookie = `${LOCALE_KEY}=${locale}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
    document.cookie = `${THEME_KEY}=${theme}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
  }
}

/**
 * Provides instant bilingual dictionary access and client-side theme/locale persistence.
 */
export function PreferencesProvider({
  initialLocale,
  initialTheme,
  hasCookieLocale = false,
  hasCookieTheme = false,
  children,
}: PreferencesProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  const prefsRef = useRef<{ locale: Locale; theme: Theme }>({
    locale: initialLocale,
    theme: initialTheme,
  });
  const persistHandlerRef = useRef<PersistPreferencesHandler | null>(null);

  const applyPreferences = useCallback(
    (patch: PreferencesPatch, options?: UpdatePreferencesOptions) => {
      const nextLocale = patch.locale ?? prefsRef.current.locale;
      const nextTheme = patch.theme ?? prefsRef.current.theme;

      if (
        nextLocale === prefsRef.current.locale &&
        nextTheme === prefsRef.current.theme
      ) {
        return;
      }

      prefsRef.current = { locale: nextLocale, theme: nextTheme };
      setLocaleState(nextLocale);
      setThemeState(nextTheme);

      syncDocumentAttributes(nextLocale, nextTheme);
      writeClientPersistence(nextLocale, nextTheme);

      if (options?.persist !== false && persistHandlerRef.current) {
        void Promise.resolve(persistHandlerRef.current(patch)).catch(
          () => undefined,
        );
      }
    },
    [],
  );

  useEffect(() => {
    const patch: PreferencesPatch = {};
    try {
      if (!hasCookieLocale) {
        const storedLocale = window.localStorage.getItem(LOCALE_KEY);
        if (storedLocale === "id" || storedLocale === "en") {
          patch.locale = storedLocale;
        }
      }
      if (!hasCookieTheme) {
        const storedTheme = window.localStorage.getItem(THEME_KEY);
        if (storedTheme === "light" || storedTheme === "dark") {
          patch.theme = storedTheme;
        }
      }
    } catch {
      // Ignore restricted storage access.
    }

    if (
      (patch.locale && patch.locale !== prefsRef.current.locale) ||
      (patch.theme && patch.theme !== prefsRef.current.theme)
    ) {
      applyPreferences(patch, { persist: false });
    } else {
      syncDocumentAttributes(prefsRef.current.locale, prefsRef.current.theme);
    }
  }, [applyPreferences, hasCookieLocale, hasCookieTheme]);

  useEffect(() => {
    syncDocumentAttributes(locale, theme);
  }, [locale, theme]);

  const setLocale = useCallback(
    (nextLocale: Locale) => {
      applyPreferences({ locale: nextLocale });
    },
    [applyPreferences],
  );

  const registerPersistHandler = useCallback(
    (fn: PersistPreferencesHandler) => {
      persistHandlerRef.current = fn;
      return () => {
        if (persistHandlerRef.current === fn) {
          persistHandlerRef.current = null;
        }
      };
    },
    [],
  );

  const i18nValue = useMemo(
    () => ({
      locale,
      t: DICTIONARIES[locale],
      setLocale,
    }),
    [locale, setLocale],
  );

  const preferencesValue = useMemo(
    () => ({
      locale,
      theme,
      updatePreferences: applyPreferences,
      registerPersistHandler,
    }),
    [locale, theme, applyPreferences, registerPersistHandler],
  );

  return (
    <PreferencesContext.Provider value={preferencesValue}>
      <I18nContext.Provider value={i18nValue}>{children}</I18nContext.Provider>
    </PreferencesContext.Provider>
  );
}

