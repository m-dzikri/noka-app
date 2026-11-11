import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";
import { DevOutboxMailer } from "@/lib/mailer/dev";
import { ResendMailer } from "@/lib/mailer/resend";
import type { MailerAdapter } from "@/lib/mailer/types";

/**
 * Selects the runtime MailerAdapter (Resend in production/configured non-test, DevOutbox in dev/test).
 */
export function getMailer(): MailerAdapter {
  const env = getEnv();

  if (env.NODE_ENV !== "test" && env.RESEND_API_KEY && env.EMAIL_FROM) {
    return new ResendMailer(env.RESEND_API_KEY, env.EMAIL_FROM);
  }

  if (env.NODE_ENV === "production") {
    throw new ApiError(
      503,
      "MAIL_DELIVERY_UNAVAILABLE",
      "Email delivery service is unavailable",
    );
  }

  return new DevOutboxMailer();
}

