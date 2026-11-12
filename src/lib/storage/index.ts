import path from "node:path";
import { ApiError } from "@/lib/api-response";
import { getEnv } from "@/lib/env";
import { LocalStorageAdapter } from "@/lib/storage/local";
import { S3StorageAdapter } from "@/lib/storage/s3";
import type { DeleteObjectsResult, StorageAdapter } from "@/lib/storage/types";

class UnavailableStorageAdapter implements StorageAdapter {
  private createError(): ApiError {
    return new ApiError(
      503,
      "STORAGE_UNAVAILABLE",
      "Attachment storage service is unavailable",
    );
  }

  async putObject(): Promise<void> {
    throw this.createError();
  }

  async readObject(): Promise<Buffer | null> {
    throw this.createError();
  }

  async deleteObject(): Promise<void> {
    throw this.createError();
  }

  async deleteObjects(): Promise<DeleteObjectsResult> {
    throw this.createError();
  }

  async getSignedReadUrl(): Promise<string | null> {
    throw this.createError();
  }
}

/**
 * Selects the runtime StorageAdapter from validated environment variables (STACK-3, ARCH-6).
 */
export function getStorage(): StorageAdapter {
  const env = getEnv();

  if (
    env.S3_ENDPOINT &&
    env.S3_BUCKET &&
    env.S3_ACCESS_KEY_ID &&
    env.S3_SECRET_ACCESS_KEY
  ) {
    return new S3StorageAdapter({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION ?? "auto",
      bucket: env.S3_BUCKET,
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    });
  }

  if (env.NODE_ENV === "production") {
    return new UnavailableStorageAdapter();
  }

  return new LocalStorageAdapter(
    env.LOCAL_UPLOADS_DIR ?? path.join(process.cwd(), ".data", "uploads"),
  );
}

export type { DeleteObjectsResult, StorageAdapter };
