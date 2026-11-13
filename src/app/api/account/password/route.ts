import type { NextRequest } from "next/server";
import { changePasswordSchema } from "@/features/account/schemas";
import { changePassword } from "@/features/account/service";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth } from "@/features/auth/session";
import { ApiError, apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user, sessionId } = await requireAuth(req);

    const rawBody: unknown = await req.json();
    const result = changePasswordSchema.safeParse(rawBody);

    if (!result.success) {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Data masukan kata sandi tidak valid",
        result.error.flatten().fieldErrors,
      );
    }

    await changePassword(user.id, sessionId, result.data);

    return apiOk({ updated: true }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

