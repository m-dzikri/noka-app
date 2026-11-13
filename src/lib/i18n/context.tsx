"use client";

import { createContext, useContext } from "react";
import type {
  Dictionary,
  Locale,
  PersistPreferencesHandler,
  PreferencesPatch,
  Theme,
  UpdatePreferencesOptions,
} from "@/lib/i18n/types";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import { enDictionary } from "@/lib/i18n/dictionaries/en";

export interface I18nContextValue {
  locale: Locale;
  t: Dictionary;
  setLocale: (locale: Locale) => void;
}

export interface PreferencesContextValue {
  locale: Locale;
  theme: Theme;
  updatePreferences: (
    patch: PreferencesPatch,
    options?: UpdatePreferencesOptions,
  ) => void;
  registerPersistHandler: (fn: PersistPreferencesHandler) => () => void;
}

export const DICTIONARIES: Record<Locale, Dictionary> = {
  id: idDictionary,
  en: enDictionary,
};

export const I18nContext = createContext<I18nContextValue | null>(null);
export const PreferencesContext = createContext<PreferencesContextValue | null>(
  null,
);

/**
 * Reads the active dictionary and instant client-side locale switcher.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within PreferencesProvider");
  }

  // DICTIONARIES is always fully populated at module load time (both id and en
  // include all namespaces including settings). Returning context directly is
  // safe. The guard below is a last-resort safety net for stale HMR edge cases
  // without introducing a new dictionary import at the call site.
  const t = context.t;
  if (!t?.settings) {
    const dict = DICTIONARIES[context.locale] ?? DICTIONARIES.id;
    return { ...context, t: dict };
  }

  return context;
}

/**
 * Reads and updates theme and locale preferences without forcing page reload.
 */
export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error("usePreferences must be used within PreferencesProvider");
  }
  return context;
}

