import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ApiError } from "@/lib/api-response";
import type { DeleteObjectsResult, StorageAdapter } from "@/lib/storage/types";

function isNodeNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return (error as { code?: unknown }).code === "ENOENT";
}

function resolveSafeLocalPath(baseDir: string, rawKey: string): string {
  const key = rawKey.trim();
  if (
    !key ||
    key.includes("\0") ||
    key.startsWith("/") ||
    key.startsWith("\\") ||
    path.isAbsolute(key)
  ) {
    throw new ApiError(422, "VALIDATION_ERROR", "Invalid storage object key");
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, key);
  if (!resolvedTarget.startsWith(resolvedBase + path.sep)) {
    throw new ApiError(
      422,
      "VALIDATION_ERROR",
      "Storage key escapes configured uploads directory",
    );
  }

  return resolvedTarget;
}

/**
 * Local filesystem fallback adapter for development and integration tests with path-traversal protection.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly baseDir: string;

  constructor(
    baseDir: string = path.join(process.cwd(), ".data", "uploads"),
  ) {
    this.baseDir = path.resolve(/*turbopackIgnore: true*/ baseDir);
  }

  async putObject(key: string, body: Buffer): Promise<void> {
    const targetPath = resolveSafeLocalPath(this.baseDir, key);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, body);
  }

  async readObject(key: string): Promise<Buffer | null> {
    const targetPath = resolveSafeLocalPath(this.baseDir, key);
    try {
      return await readFile(targetPath);
    } catch (error) {
      if (isNodeNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    const targetPath = resolveSafeLocalPath(this.baseDir, key);
    try {
      await unlink(targetPath);
    } catch (error) {
      if (isNodeNotFoundError(error)) {
        return;
      }
      throw error;
    }
  }

  async deleteObjects(keys: string[]): Promise<DeleteObjectsResult> {
    if (keys.length === 0) {
      return { failedKeys: [] };
    }

    const failedKeys: string[] = [];
    for (const key of keys) {
      try {
        await this.deleteObject(key);
      } catch {
        failedKeys.push(key);
      }
    }

    return { failedKeys };
  }

  async getSignedReadUrl(): Promise<string | null> {
    return null;
  }
}
