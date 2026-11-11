import type { NextRequest } from "next/server";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import {
  clearSessionCookie,
  readSessionCookieToken,
  revokeSessionByRawToken,
} from "@/features/auth/session";
import { apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);

    const rawToken = await readSessionCookieToken(req);
    if (rawToken) {
      await revokeSessionByRawToken(rawToken);
    }

    const response = apiOk({ loggedOut: true }, 200);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

