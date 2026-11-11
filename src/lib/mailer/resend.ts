import { Resend } from "resend";
import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { renderPasswordResetEmail } from "@/lib/mailer/templates";
import type { MailerAdapter, SendPasswordResetInput } from "@/lib/mailer/types";

/**
 * Production MailerAdapter backed by Resend with safe OBS-2/OBS-3 error mapping.
 */
export class ResendMailer implements MailerAdapter {
  private readonly apiKey: string;
  private readonly fromAddress: string;

  constructor(apiKey?: string, fromAddress?: string) {
    const env = getEnv();
    const resolvedKey = apiKey ?? env.RESEND_API_KEY;
    const resolvedFrom = fromAddress ?? env.EMAIL_FROM;

    if (!resolvedKey || !resolvedFrom) {
      throw new ApiError(
        503,
        "MAIL_DELIVERY_UNAVAILABLE",
        "Email delivery service is not configured",
      );
    }

    this.apiKey = resolvedKey;
    this.fromAddress = resolvedFrom;
  }

  async sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    const rendered = renderPasswordResetEmail(input);
    const client = new Resend(this.apiKey);

    try {
      const result = await client.emails.send({
        from: this.fromAddress,
        to: input.to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      if (result.error) {
        logger.error("mailer.resend_rejected", {
          errorName: result.error.name,
          locale: input.locale,
        });
        throw new ApiError(
          503,
          "MAIL_DELIVERY_UNAVAILABLE",
          "Unable to deliver password reset email",
        );
      }
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      logger.error("mailer.resend_failed", {
        error,
        locale: input.locale,
      });
      throw new ApiError(
        503,
        "MAIL_DELIVERY_UNAVAILABLE",
        "Unable to deliver password reset email",
      );
    }
  }
}

