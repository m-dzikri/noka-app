import { cookies } from "next/headers";
import type { Locale, Theme } from "@/lib/i18n/types";

export const LOCALE_COOKIE_NAME = "noka_locale";
export const THEME_COOKIE_NAME = "noka_theme";

export interface ServerPreferences {
  locale: Locale;
  theme: Theme;
  hasCookieLocale: boolean;
  hasCookieTheme: boolean;
}

/**
 * Reads initial locale and theme preferences from HTTP cookies with safe defaults.
 */
export async function getServerPreferences(): Promise<ServerPreferences> {
  const cookieStore = await cookies();
  const rawLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value;
  const rawTheme = cookieStore.get(THEME_COOKIE_NAME)?.value;

  const hasCookieLocale = rawLocale === "id" || rawLocale === "en";
  const hasCookieTheme = rawTheme === "light" || rawTheme === "dark";

  return {
    locale: hasCookieLocale ? rawLocale : "id",
    theme: hasCookieTheme ? rawTheme : "light",
    hasCookieLocale,
    hasCookieTheme,
  };
}

