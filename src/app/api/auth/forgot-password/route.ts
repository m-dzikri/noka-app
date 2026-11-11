import type { NextRequest } from "next/server";
import { prepareAuthMutation } from "@/features/auth/route-helpers";
import { forgotPasswordSchema } from "@/features/auth/schemas";
import { requestPasswordReset } from "@/features/auth/service";
import { apiOk, handleApiError } from "@/lib/api-response";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/types";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const input = await prepareAuthMutation({
      req,
      bucket: "auth:forgot-password",
      limit: 5,
      includeEmailKey: true,
      schema: forgotPasswordSchema,
    });

    const responseLocale: Locale =
      req.cookies.get(LOCALE_COOKIE_NAME)?.value === "en" ? "en" : "id";

    const result = await requestPasswordReset({
      ...input,
      responseLocale,
    });

    return apiOk(result, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

