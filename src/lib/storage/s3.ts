import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { DeleteObjectsResult, StorageAdapter } from "@/lib/storage/types";

const S3_DELETE_BATCH_SIZE = 1000;
const DEFAULT_SIGNED_URL_TTL_SECONDS = 900;

export interface S3StorageConfig {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  client?: S3Client;
}

function isS3NotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const record = error as {
    name?: unknown;
    Code?: unknown;
    $metadata?: { httpStatusCode?: unknown };
  };

  return (
    record.name === "NoSuchKey" ||
    record.Code === "NoSuchKey" ||
    record.$metadata?.httpStatusCode === 404
  );
}

async function readBodyToBuffer(body: unknown): Promise<Buffer | null> {
  if (body === null || body === undefined) {
    return null;
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  if (
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof (body as { transformToByteArray?: unknown }).transformToByteArray ===
      "function"
  ) {
    const bytes = await (
      body as { transformToByteArray(): Promise<Uint8Array> }
    ).transformToByteArray();
    return Buffer.from(bytes);
  }

  if (
    typeof body === "object" &&
    Symbol.asyncIterator in body &&
    typeof (body as AsyncIterable<unknown>)[Symbol.asyncIterator] === "function"
  ) {
    const chunks: Buffer[] = [];
    for await (const chunk of body as AsyncIterable<unknown>) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      }
    }
    return Buffer.concat(chunks);
  }

  return null;
}

/**
 * Cloudflare R2 / S3-compatible object storage adapter using path-style requests and batch deletes.
 */
export class S3StorageAdapter implements StorageAdapter {
  private readonly bucket: string;
  private readonly client: S3Client;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.client =
      config.client ??
      new S3Client({
        endpoint: config.endpoint,
        region: config.region,
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  async putObject(
    key: string,
    body: Buffer,
    contentType: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  async readObject(key: string): Promise<Buffer | null> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
      return await readBodyToBuffer(response.Body);
    } catch (error) {
      if (isS3NotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (isS3NotFoundError(error)) {
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

    for (let offset = 0; offset < keys.length; offset += S3_DELETE_BATCH_SIZE) {
      const batch = keys.slice(offset, offset + S3_DELETE_BATCH_SIZE);

      try {
        const response = await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: {
              Objects: batch.map((Key) => ({ Key })),
              Quiet: true,
            },
          }),
        );

        for (const entry of response.Errors ?? []) {
          if (entry.Code !== "NoSuchKey" && entry.Key) {
            failedKeys.push(entry.Key);
          }
        }
      } catch (error) {
        if (!isS3NotFoundError(error)) {
          failedKeys.push(...batch);
        }
      }
    }

    return { failedKeys };
  }

  async getSignedReadUrl(
    key: string,
    expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<string | null> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}

