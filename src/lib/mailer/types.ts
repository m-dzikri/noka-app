import type { Locale } from "@/lib/i18n/types";

export interface SendPasswordResetInput {
  to: string;
  name: string;
  resetUrl: string;
  locale: Locale;
}

export interface OutboxEmail {
  to: string;
  subject: string;
  html: string;
  text: string;
  resetUrl: string;
  locale: Locale;
  createdAt: string;
}

export interface MailerAdapter {
  sendPasswordReset(input: SendPasswordResetInput): Promise<void>;
}

