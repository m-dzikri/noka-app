import { and, eq, isNull } from "drizzle-orm";
import { getDb, type AppDatabase } from "@/db";
import { passwordResetTokens, sessions, users } from "@/db/schema/auth";
import { categories } from "@/db/schema/finance";
import { buildDefaultCategoriesForUser } from "@/features/auth/default-categories";
import {
  generateTokenPair,
  hashPassword,
  hashToken,
  verifyPassword,
} from "@/features/auth/password";
import type {
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
} from "@/features/auth/schemas";
import { SESSION_TTL_MS, type AuthUser } from "@/features/auth/session";
import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";
import { enDictionary } from "@/lib/i18n/dictionaries/en";
import { idDictionary } from "@/lib/i18n/dictionaries/id";
import type { Locale, Theme } from "@/lib/i18n/types";
import { getMailer } from "@/lib/mailer";

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;

type TransactionRunner = Parameters<
  Parameters<AppDatabase["transaction"]>[0]
>[0];

function isPgUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown };
  if (record.code === "23505") {
    return true;
  }
  if (typeof record.cause === "object" && record.cause !== null) {
    return (record.cause as { code?: unknown }).code === "23505";
  }
  return false;
}

function toAuthUserDto(row: {
  id: string;
  name: string;
  email: string;
  locale: string;
  theme: string;
  cycleStartDay: string;
}): AuthUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    locale: row.locale === "en" ? "en" : "id",
    theme: row.theme === "dark" ? "dark" : "light",
    cycleStartDay: row.cycleStartDay,
  };
}

async function createSessionForUser(
  executor: AppDatabase | TransactionRunner,
  userId: string,
): Promise<string> {
  const { rawToken, tokenHash } = generateTokenPair();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await executor.insert(sessions).values({
    userId,
    tokenHash,
    expiresAt,
  });

  return rawToken;
}

/**
 * Registers a user, seeds 12 system categories, and creates an immediate 30-day session (F4, DEC-5).
 */
export async function registerUser(
  input: RegisterInput & { defaultLocale: Locale; defaultTheme: Theme },
): Promise<{ user: AuthUser; rawSessionToken: string }> {
  const locale = input.locale ?? input.defaultLocale;
  const theme = input.theme ?? input.defaultTheme;
  const passwordHash = await hashPassword(input.password);

  try {
    return await getDb().transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash,
          locale,
          theme,
        })
        .returning({
          id: users.id,
          name: users.name,
          email: users.email,
          locale: users.locale,
          theme: users.theme,
          cycleStartDay: users.cycleStartDay,
        });

      const defaultCategories = buildDefaultCategoriesForUser(
        created.id,
        locale,
      );
      await tx.insert(categories).values(defaultCategories);

      const rawSessionToken = await createSessionForUser(tx, created.id);
      return {
        user: toAuthUserDto(created),
        rawSessionToken,
      };
    });
  } catch (error) {
    if (isPgUniqueViolation(error)) {
      throw new ApiError(
        409,
        "EMAIL_ALREADY_EXISTS",
        "Email is already registered",
      );
    }
    throw error;
  }
}

/**
 * Authenticates an email/password pair and issues a new 30-day session token.
 */
export async function loginUser(
  input: LoginInput,
): Promise<{ user: AuthUser; rawSessionToken: string }> {
  const db = getDb();
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      passwordHash: users.passwordHash,
      locale: users.locale,
      theme: users.theme,
      cycleStartDay: users.cycleStartDay,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  const userRow = rows[0];
  if (!userRow) {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password",
    );
  }

  const valid = await verifyPassword(input.password, userRow.passwordHash);
  if (!valid) {
    throw new ApiError(
      401,
      "INVALID_CREDENTIALS",
      "Invalid email or password",
    );
  }

  const rawSessionToken = await createSessionForUser(db, userRow.id);
  return {
    user: toAuthUserDto(userRow),
    rawSessionToken,
  };
}

/**
 * Issues a 30-minute single-use password reset token if registered while always returning a generic response (API-4).
 */
export async function requestPasswordReset(
  input: ForgotPasswordInput & { responseLocale: Locale },
): Promise<{ message: string }> {
  const mailer = getMailer();
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      locale: users.locale,
    })
    .from(users)
    .where(eq(users.email, input.email))
    .limit(1);

  const user = rows[0];
  if (user) {
    const { rawToken, tokenHash } = generateTokenPair();
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    const [inserted] = await db
      .insert(passwordResetTokens)
      .values({
        userId: user.id,
        tokenHash,
        expiresAt,
      })
      .returning({ id: passwordResetTokens.id });

    const appUrl = getEnv().APP_URL;
    const resetUrl = `${appUrl}/reset-password?token=${rawToken}`;
    const emailLocale: Locale = user.locale === "en" ? "en" : "id";

    try {
      await mailer.sendPasswordReset({
        to: user.email,
        name: user.name,
        resetUrl,
        locale: emailLocale,
      });
    } catch (error) {
      await db
        .delete(passwordResetTokens)
        .where(eq(passwordResetTokens.id, inserted.id))
        .catch(() => undefined);
      throw error;
    }
  }

  const dict = input.responseLocale === "en" ? enDictionary : idDictionary;
  return {
    message: dict.auth.forgotPasswordGenericApiMessage,
  };
}

/**
 * Atomically consumes a reset token with FOR UPDATE, updates password, invalidates active reset tokens, and revokes all user sessions (SEC-2, HIGH-4).
 */
export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  const tokenHash = hashToken(input.token);

  await getDb().transaction(async (tx) => {
    const rows = await tx
      .select({
        id: passwordResetTokens.id,
        userId: passwordResetTokens.userId,
        expiresAt: passwordResetTokens.expiresAt,
        usedAt: passwordResetTokens.usedAt,
      })
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.tokenHash, tokenHash))
      .for("update")
      .limit(1);

    const tokenRow = rows[0];
    const now = new Date();
    if (
      !tokenRow ||
      tokenRow.usedAt !== null ||
      tokenRow.expiresAt.getTime() <= now.getTime()
    ) {
      throw new ApiError(
        400,
        "INVALID_OR_EXPIRED_TOKEN",
        "Password reset token is invalid or expired",
      );
    }

    const nextPasswordHash = await hashPassword(input.newPassword);

    await tx
      .update(users)
      .set({
        passwordHash: nextPasswordHash,
        updatedAt: now,
      })
      .where(eq(users.id, tokenRow.userId));

    await tx
      .update(passwordResetTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(passwordResetTokens.userId, tokenRow.userId),
          isNull(passwordResetTokens.usedAt),
        ),
      );

    await tx.delete(sessions).where(eq(sessions.userId, tokenRow.userId));
  });
}

