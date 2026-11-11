import { z } from "zod";
import { ApiError } from "@/lib/api-response";

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(255)),
  password: z.string().min(8).max(128),
  locale: z.enum(["id", "en"]).optional(),
  theme: z.enum(["light", "dark"]).optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(255)),
  password: z.string().min(1).max(128),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.string().email().max(255)),
});

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(1).max(256),
  newPassword: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * Extracts a normalized email key for SEC-5 rate limiting before Zod schema validation runs.
 */
export function extractEmailRateLimitKey(body: unknown): string {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return "anonymous";
  }

  const rawEmail = (body as Record<string, unknown>).email;
  if (typeof rawEmail !== "string") {
    return "anonymous";
  }

  const normalized = rawEmail.trim().toLowerCase();
  return normalized.length > 0 ? normalized.slice(0, 255) : "anonymous";
}

/**
 * Validates input against a Zod schema and maps failures to API-1/API-2 422 responses.
 */
export function validateWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Validation failed",
      result.error.flatten().fieldErrors,
    );
  }
  return result.data;
}

