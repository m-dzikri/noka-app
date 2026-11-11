import { getEnv } from "@/lib/env";
import { apiError, apiOk, handleApiError } from "@/lib/api-response";
import { getOutboxEmails } from "@/lib/mailer/dev";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    if (getEnv().NODE_ENV === "production") {
      return apiError(404, "NOT_FOUND", "Not found");
    }

    return apiOk({ emails: getOutboxEmails() }, 200);
  } catch (error) {
    return handleApiError(error);
  }
}

