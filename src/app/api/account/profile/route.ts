import type { NextRequest } from "next/server";
import { updateProfileSchema } from "@/features/account/schemas";
import { updateProfile } from "@/features/account/service";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { requireAuth, setPreferenceCookies } from "@/features/auth/session";
import { ApiError, apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);

    const rawBody: unknown = await req.json();
    const result = updateProfileSchema.safeParse(rawBody);

    if (!result.success) {
      const cycleIssue = result.error.issues.find(
        (issue) =>
          issue.path.includes("cycleStartDay") ||
          issue.message === "INVALID_CYCLE_DAY",
      );
      if (cycleIssue) {
        throw new ApiError(
          422,
          "INVALID_CYCLE_DAY",
          "Hari mulai siklus harus antara 1-28 atau end_of_month",
        );
      }
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Data masukan profil tidak valid",
        result.error.flatten().fieldErrors,
      );
    }

    const updatedUser = await updateProfile(user.id, result.data);

    const response = apiOk({ user: updatedUser }, 200);
    setPreferenceCookies(response, updatedUser.locale, updatedUser.theme);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

