import type { NextRequest } from "next/server";
import { prepareAuthMutation } from "@/features/auth/route-helpers";
import { loginSchema } from "@/features/auth/schemas";
import { loginUser } from "@/features/auth/service";
import { setPreferenceCookies, setSessionCookie } from "@/features/auth/session";
import { apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const input = await prepareAuthMutation({
      req,
      bucket: "auth:login",
      limit: 10,
      includeEmailKey: true,
      schema: loginSchema,
    });

    const { user, rawSessionToken } = await loginUser(input);

    const response = apiOk({ user }, 200);
    setSessionCookie(response, rawSessionToken);
    setPreferenceCookies(response, user.locale, user.theme);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

