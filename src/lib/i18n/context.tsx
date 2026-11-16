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
  get id() {
    return idDictionary;
  },
  get en() {
    return enDictionary;
  },
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

  const locale = context.locale === "en" ? "en" : "id";
  const directDict = locale === "en" ? enDictionary : idDictionary;
  const rawContextT = context.t;

  // Deep merge directDict with rawContextT to ensure all namespaces and sub-namespaces
  // (such as finance.budgets and settings) are guaranteed to exist, even across Fast Refresh / HMR staleness.
  const budgets = {
    ...directDict.finance.budgets,
    ...(rawContextT?.finance?.budgets ?? {}),
  };
  const recurring = {
    ...directDict.finance.recurring,
    ...(rawContextT?.finance?.recurring ?? {}),
  };
  const exportModal = {
    ...directDict.finance.exportModal,
    ...(rawContextT?.finance?.exportModal ?? {}),
  };
  const reportPage = {
    ...directDict.finance.reportPage,
    ...(rawContextT?.finance?.reportPage ?? {}),
  };
  const finance = {
    ...directDict.finance,
    ...(rawContextT?.finance ?? {}),
    budgets,
    recurring,
    exportModal,
    reportPage,
  };
  const settings =
    rawContextT?.settings ?? directDict.settings ?? idDictionary.settings;

  const t: Dictionary = {
    ...directDict,
    ...(rawContextT ?? {}),
    finance,
    settings,
  };

  return {
    ...context,
    locale,
    t,
  };
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

