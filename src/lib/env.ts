import { z } from "zod";

const emptyToUndefined = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() === "" ? undefined : value;
};

const appUrlSchema = z
  .string()
  .trim()
  .url()
  .default("http://localhost:3000")
  .transform((value) => value.replace(/\/+$/, ""));

const emailValidator = z.string().email();

function isValidEmailFrom(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return false;
  }
  const bracketMatch = trimmed.match(/^.+<([^<>]+)>$/);
  const address = bracketMatch ? bracketMatch[1].trim() : trimmed;
  return emailValidator.safeParse(address).success;
}

const rawEnvSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    APP_URL: appUrlSchema,
    SESSION_SECRET: z
      .string()
      .min(32, "SESSION_SECRET must be at least 32 characters"),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    LOCAL_UPLOADS_DIR: z.string().min(1).optional(),
    S3_ENDPOINT: z.string().min(1).optional(),
    S3_REGION: z.string().min(1).optional(),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(3).optional(),
  })
  .superRefine((data, ctx) => {
    const s3Active =
      data.S3_ENDPOINT !== undefined ||
      data.S3_REGION !== undefined ||
      data.S3_BUCKET !== undefined ||
      data.S3_ACCESS_KEY_ID !== undefined ||
      data.S3_SECRET_ACCESS_KEY !== undefined;

    if (s3Active) {
      if (!data.S3_ENDPOINT) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message: "S3_ENDPOINT is required when S3 storage is configured",
        });
      } else if (!z.string().url().safeParse(data.S3_ENDPOINT).success) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ENDPOINT"],
          message: "S3_ENDPOINT must be a valid URL",
        });
      }

      if (!data.S3_BUCKET) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_BUCKET"],
          message: "S3_BUCKET is required when S3 storage is configured",
        });
      }

      if (!data.S3_ACCESS_KEY_ID) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_ACCESS_KEY_ID"],
          message: "S3_ACCESS_KEY_ID is required when S3 storage is configured",
        });
      }

      if (!data.S3_SECRET_ACCESS_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["S3_SECRET_ACCESS_KEY"],
          message:
            "S3_SECRET_ACCESS_KEY is required when S3 storage is configured",
        });
      }
    }

    const mailerActive =
      data.RESEND_API_KEY !== undefined || data.EMAIL_FROM !== undefined;

    if (mailerActive) {
      if (!data.RESEND_API_KEY) {
        ctx.addIssue({
          code: "custom",
          path: ["RESEND_API_KEY"],
          message: "RESEND_API_KEY is required when mailer is configured",
        });
      }

      if (!data.EMAIL_FROM) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM"],
          message: "EMAIL_FROM is required when mailer is configured",
        });
      } else if (!isValidEmailFrom(data.EMAIL_FROM)) {
        ctx.addIssue({
          code: "custom",
          path: ["EMAIL_FROM"],
          message:
            'EMAIL_FROM must be a valid email address or "Name <email@domain>"',
        });
      }
    }
  })
  .transform((data) => {
    const s3Active =
      data.S3_ENDPOINT !== undefined ||
      data.S3_REGION !== undefined ||
      data.S3_BUCKET !== undefined ||
      data.S3_ACCESS_KEY_ID !== undefined ||
      data.S3_SECRET_ACCESS_KEY !== undefined;

    return {
      ...data,
      S3_REGION: s3Active ? (data.S3_REGION ?? "auto") : undefined,
    };
  });

export type AppEnv = z.infer<typeof rawEnvSchema>;

let cachedEnv: AppEnv | null = null;

function readNormalizedEnvInput() {
  return {
    DATABASE_URL: emptyToUndefined(process.env.DATABASE_URL),
    APP_URL: emptyToUndefined(process.env.APP_URL),
    SESSION_SECRET: emptyToUndefined(process.env.SESSION_SECRET),
    NODE_ENV: emptyToUndefined(process.env.NODE_ENV),
    LOCAL_UPLOADS_DIR: emptyToUndefined(process.env.LOCAL_UPLOADS_DIR),
    S3_ENDPOINT: emptyToUndefined(process.env.S3_ENDPOINT),
    S3_REGION: emptyToUndefined(process.env.S3_REGION),
    S3_BUCKET: emptyToUndefined(process.env.S3_BUCKET),
    S3_ACCESS_KEY_ID: emptyToUndefined(process.env.S3_ACCESS_KEY_ID),
    S3_SECRET_ACCESS_KEY: emptyToUndefined(process.env.S3_SECRET_ACCESS_KEY),
    RESEND_API_KEY: emptyToUndefined(process.env.RESEND_API_KEY),
    EMAIL_FROM: emptyToUndefined(process.env.EMAIL_FROM),
  };
}

/**
 * Validates only APP_URL without requiring DB or secret env vars (build-safe per ARCH-6).
 */
export function getAppUrl(): string {
  return appUrlSchema.parse(emptyToUndefined(process.env.APP_URL));
}

/**
 * Clears the cached server environment object (intended for isolated test runs).
 */
export function resetEnvCacheForTest(): void {
  cachedEnv = null;
}

/**
 * Parses and caches validated server environment variables on demand.
 */
export function getEnv(): AppEnv {
  const nodeEnv = process.env.NODE_ENV;
  if (nodeEnv !== "test" && cachedEnv !== null) {
    return cachedEnv;
  }

  const parsed = rawEnvSchema.parse(readNormalizedEnvInput());
  if (nodeEnv !== "test") {
    cachedEnv = parsed;
  }
  return parsed;
}

