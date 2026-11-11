import type { NextRequest } from "next/server";
import { prepareAuthMutation } from "@/features/auth/route-helpers";
import { resetPasswordSchema } from "@/features/auth/schemas";
import { resetPassword } from "@/features/auth/service";
import { apiOk, handleApiError } from "@/lib/api-response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const input = await prepareAuthMutation({
      req,
      bucket: "auth:reset-password",
      limit: 5,
      includeEmailKey: false,
      schema: resetPasswordSchema,
    });

    await resetPassword(input);
    return apiOk({ reset: true }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

