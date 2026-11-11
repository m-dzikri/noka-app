import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import type { SendPasswordResetInput } from "@/lib/mailer/types";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Renders localized subject, plain-text, and HTML bodies for password reset emails.
 */
export function renderPasswordResetEmail(input: SendPasswordResetInput): {
  subject: string;
  html: string;
  text: string;
} {
  const dict = input.locale === "en" ? enDictionary : idDictionary;
  const { auth } = dict;
  const safeName = escapeHtml(input.name);
  const safeUrl = escapeHtml(input.resetUrl);

  const greeting =
    input.locale === "en" ? `Hi ${input.name},` : `Halo ${input.name},`;
  const htmlGreeting =
    input.locale === "en" ? `Hi ${safeName},` : `Halo ${safeName},`;

  const text = [
    greeting,
    "",
    auth.forgotPasswordEmailIntro,
    input.resetUrl,
    "",
    auth.forgotPasswordEmailExpiry,
    auth.forgotPasswordEmailIgnore,
  ].join("\n");

  const html = `<!doctype html>
<html lang="${input.locale}">
  <body style="font-family: sans-serif; color: #222222; background: #ededed; padding: 24px; line-height: 1.6;">
    <div style="max-width: 520px; margin: 0 auto; background: #f7f7f6; border: 1px solid #d6d6d4; border-radius: 16px; padding: 24px;">
      <h1 style="font-size: 20px; margin: 0 0 12px; color: #222222;">${escapeHtml(auth.forgotPasswordEmailHeading)}</h1>
      <p style="margin: 0 0 12px;">${htmlGreeting}</p>
      <p style="margin: 0 0 20px;">${escapeHtml(auth.forgotPasswordEmailIntro)}</p>
      <p style="margin: 0 0 20px;">
        <a href="${safeUrl}" style="display: inline-block; background: #ff7448; color: #222222; text-decoration: none; padding: 10px 20px; border-radius: 9999px; font-weight: 600;">
          ${escapeHtml(auth.forgotPasswordEmailAction)}
        </a>
      </p>
      <p style="font-size: 13px; color: #595959; margin: 0 0 8px;">${escapeHtml(auth.forgotPasswordEmailExpiry)}</p>
      <p style="font-size: 13px; color: #595959; margin: 0;">${escapeHtml(auth.forgotPasswordEmailIgnore)}</p>
    </div>
  </body>
</html>`;

  return {
    subject: auth.forgotPasswordEmailSubject,
    html,
    text,
  };
}

