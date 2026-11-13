import type { NextRequest } from "next/server";
import { deleteAccountSchema } from "@/features/account/schemas";
import { deleteAccount } from "@/features/account/service";
import { verifyCsrfOrigin } from "@/features/auth/csrf";
import { clearSessionCookie, requireAuth } from "@/features/auth/session";
import { ApiError, apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  try {
    verifyCsrfOrigin(req);
    const { user } = await requireAuth(req);

    const rawBody: unknown = await req.json();
    const result = deleteAccountSchema.safeParse(rawBody);

    if (!result.success) {
      throw new ApiError(
        422,
        "VALIDATION_ERROR",
        "Data masukan konfirmasi hapus akun tidak valid",
        result.error.flatten().fieldErrors,
      );
    }

    await deleteAccount(user.id, result.data.password);

    const response = apiOk({ deleted: true }, 200);
    clearSessionCookie(response);
    return response;
  } catch (error) {
    return handleApiError(error);
  }
}

