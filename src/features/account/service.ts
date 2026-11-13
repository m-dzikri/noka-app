import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema/auth";
import {
  categories,
  transactions,
  transfers,
  wallets,
} from "@/db/schema/finance";
import { noteAttachments } from "@/db/schema/notes";
import { hashPassword, verifyPassword } from "@/features/auth/password";
import type { AuthUser } from "@/features/auth/session";
import { deleteUserAttachmentObjects } from "@/features/notes/attachments-service";
import { ApiError } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getStorage, type StorageAdapter } from "@/lib/storage";
import type {
  ChangePasswordInput,
  UpdateProfileInput,
} from "./schemas";

/**
 * Updates user profile attributes (name, locale, theme, cycleStartDay)
 * and returns the sanitized AuthUser DTO (`RFC-010`, `FR-2`, `DATA-5`).
 */
export async function updateProfile(
  userId: string,
  input: UpdateProfileInput,
): Promise<AuthUser> {
  const db = getDb();
  const updateData: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updateData.name = input.name.trim();
  }
  if (input.locale !== undefined) {
    updateData.locale = input.locale;
  }
  if (input.theme !== undefined) {
    updateData.theme = input.theme;
  }
  if (input.cycleStartDay !== undefined) {
    updateData.cycleStartDay = input.cycleStartDay;
  }

  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      locale: users.locale,
      theme: users.theme,
      cycleStartDay: users.cycleStartDay,
    });

  if (!updatedUser) {
    throw new ApiError(401, "UNAUTHORIZED", "User not found");
  }

  return {
    id: updatedUser.id,
    name: updatedUser.name,
    email: updatedUser.email,
    locale: updatedUser.locale === "en" ? "en" : "id",
    theme: updatedUser.theme === "dark" ? "dark" : "light",
    cycleStartDay: updatedUser.cycleStartDay,
  };
}

/**
 * Changes user password with current password verification, re-hashing with bcrypt cost >= 12,
 * and revoking all other active sessions while preserving current session (`RFC-010`, `FR-2`, `SEC-2`).
 */
export async function changePassword(
  userId: string,
  currentSessionId: string,
  input: ChangePasswordInput,
): Promise<{ updated: true }> {
  const db = getDb();

  const [user] = await db
    .select({
      id: users.id,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    throw new ApiError(401, "UNAUTHORIZED", "User not found");
  }

  const isCurrentPasswordValid = await verifyPassword(
    input.currentPassword,
    user.passwordHash,
  );

  if (!isCurrentPasswordValid) {
    throw new ApiError(
      401,
      "INVALID_CURRENT_PASSWORD",
      "Password saat ini tidak cocok",
    );
  }

  const newHash = await hashPassword(input.newPassword);

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Revoke all other active sessions for this user except the current one.
    await tx
      .delete(sessions)
      .where(and(eq(sessions.userId, userId), ne(sessions.id, currentSessionId)));
  });

  return { updated: true };
}

/**
 * Self-service permanent account deletion (`RFC-010`, `FR-22`, `SEC-6`, `OFFLINE-5`).
 * Locks user row with FOR UPDATE, verifies password, deletes entities in RESTRICT-safe FK order:
 * transfers -> transactions -> wallets -> categories -> users (cascading all child tables),
 * and purges attachment storage objects post-commit.
 */
export async function deleteAccount(
  userId: string,
  password: string,
  storage: StorageAdapter = getStorage(),
): Promise<{ deleted: true }> {
  const db = getDb();
  let keysToDelete: string[] = [];

  await db.transaction(async (tx) => {
    // 1. Lock user row to eliminate concurrent deletion races.
    const [user] = await tx
      .select({
        id: users.id,
        passwordHash: users.passwordHash,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");

    if (!user) {
      throw new ApiError(401, "UNAUTHORIZED", "User not found");
    }

    // 2. Verify password.
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new ApiError(
        401,
        "INVALID_PASSWORD",
        "Password konfirmasi salah",
      );
    }

    // 3. Query attachment storage keys before child records are cascaded.
    const attachments = await tx
      .select({ storageKey: noteAttachments.storageKey })
      .from(noteAttachments)
      .where(eq(noteAttachments.userId, userId));

    keysToDelete = attachments.map((a) => a.storageKey);

    // 4. Delete in RESTRICT-safe FK order.
    await tx.delete(transfers).where(eq(transfers.userId, userId));
    await tx.delete(transactions).where(eq(transactions.userId, userId));
    await tx.delete(wallets).where(eq(wallets.userId, userId));
    await tx.delete(categories).where(eq(categories.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
  });

  // 5. Post-commit storage object cleanup.
  if (keysToDelete.length > 0) {
    try {
      const { failedKeys } = await deleteUserAttachmentObjects(keysToDelete, storage);
      if (failedKeys.length > 0) {
        logger.warn("account_storage_cleanup_partial", {
          failedKeyCount: failedKeys.length,
          failedKeys,
        });
      }
    } catch (storageError) {
      logger.warn("account_storage_cleanup_failed", {
        error: storageError instanceof Error ? storageError.message : "Storage cleanup error",
        keyCount: keysToDelete.length,
      });
    }
  }

  return { deleted: true };
}
