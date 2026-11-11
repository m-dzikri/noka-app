import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_SALT_ROUNDS = 12;
const TOKEN_BYTE_LENGTH = 32;

/**
 * Hashes a user password with bcryptjs using cost factor >= 12 (SEC-2).
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash in constant time.
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Computes a deterministic 64-character lowercase SHA-256 hex digest for stored tokens.
 */
export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

/**
 * Generates a 32-byte CSPRNG raw base64url token and its SHA-256 hex database hash.
 */
export function generateTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = randomBytes(TOKEN_BYTE_LENGTH).toString("base64url");
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
  };
}

