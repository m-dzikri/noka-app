import type { NextRequest } from "next/server";
import { prepareAuthMutation } from "@/features/auth/route-helpers";
import { registerSchema } from "@/features/auth/schemas";
import { registerUser } from "@/features/auth/service";
import { setPreferenceCookies, setSessionCookie } from "@/features/auth/session";
import { apiOk, handleApiError } from "@/lib/api-response";
import { LOCALE_COOKIE_NAME, THEME_COOKIE_NAME } from "@/lib/i18n/server";
import type { Locale, Theme } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const input = await prepareAuthMutation({
      req,
      bucket: "auth:register",
      limit: 10,
      includeEmailKey: true,
      schema: registerSchema,
    });

    const defaultLocale: Locale =
      req.cookies.get(LOCALE_COOKIE_NAME)?.value === "en" ? "en" : "id";
    const defaultTheme: Theme =
      req.cookies.get(THEME_COOKIE_NAME)?.value === "dark" ? "dark" : "light";

    const { user, rawSessionToken } = await registerUser({
      ...input,
      defaultLocale,
      defaultTheme,
    });

    const response = apiOk({ user }, 201);
    setSessionCookie(response, rawSessionToken);
    setPreferenceCookies(response, user.locale, user.theme);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

