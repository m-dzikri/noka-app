import { renderPasswordResetEmail } from "@/lib/mailer/templates";
import type {
  MailerAdapter,
  OutboxEmail,
  SendPasswordResetInput,
} from "@/lib/mailer/types";

const globalForOutbox = globalThis as unknown as {
  __nokaDevOutbox?: OutboxEmail[];
};

function getOutboxStore(): OutboxEmail[] {
  if (!globalForOutbox.__nokaDevOutbox) {
    globalForOutbox.__nokaDevOutbox = [];
  }
  return globalForOutbox.__nokaDevOutbox;
}

/**
 * Returns all captured outbox emails in chronological order (non-production only).
 */
export function getOutboxEmails(): OutboxEmail[] {
  return [...getOutboxStore()];
}

/**
 * Returns the most recently captured outbox email, if any.
 */
export function getLastOutboxEmail(): OutboxEmail | null {
  const store = getOutboxStore();
  return store.length > 0 ? store[store.length - 1] : null;
}

/**
 * Clears captured development/test emails cleanly.
 */
export function clearOutbox(): void {
  getOutboxStore().length = 0;
}

/**
 * In-memory MailerAdapter used during local development and automated integration tests.
 */
export class DevOutboxMailer implements MailerAdapter {
  async sendPasswordReset(input: SendPasswordResetInput): Promise<void> {
    const rendered = renderPasswordResetEmail(input);
    getOutboxStore().push({
      to: input.to,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      resetUrl: input.resetUrl,
      locale: input.locale,
      createdAt: new Date().toISOString(),
    });
  }
}

