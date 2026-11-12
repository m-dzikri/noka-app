export interface DeleteObjectsResult {
  failedKeys: string[];
}

export interface StorageAdapter {
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  readObject(key: string): Promise<Buffer | null>;
  deleteObject(key: string): Promise<void>;
  deleteObjects(keys: string[]): Promise<DeleteObjectsResult>;
  getSignedReadUrl(
    key: string,
    expiresInSeconds?: number,
  ): Promise<string | null>;
}

