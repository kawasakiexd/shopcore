import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Env } from '../../config/env.schema.js';
import { DomainException } from '../../common/errors/domain.exception.js';

export type HeadResult = {
  contentType: string | undefined;
  contentLength: number | undefined;
};

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    const accountId = config.get('R2_ACCOUNT_ID', { infer: true });
    this.bucket = config.get('R2_BUCKET', { infer: true });
    this.publicBaseUrl = config.get('R2_PUBLIC_BASE_URL', { infer: true });
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.get('R2_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('R2_SECRET_ACCESS_KEY', { infer: true }),
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
  }

  publicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async presignPut(
    key: string,
    contentType: string,
    contentLength: number,
  ): Promise<{ uploadUrl: string; expiresAt: Date }> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
      });
      const uploadUrl = await getSignedUrl(this.client, command, { expiresIn: 300 });
      return { uploadUrl, expiresAt: new Date(Date.now() + 300_000) };
    } catch (error) {
      this.logger.error({ err: error }, 'Failed to presign R2 PUT');
      throw new DomainException('STORAGE_ERROR', 'Could not create an upload URL.');
    }
  }

  async head(key: string): Promise<HeadResult | null> {
    try {
      const result = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { contentType: result.ContentType, contentLength: result.ContentLength };
    } catch (error) {
      if (isNotFound(error)) return null;
      this.logger.error({ err: error, key }, 'R2 HEAD failed');
      throw new DomainException('STORAGE_ERROR', 'Could not read the uploaded object.');
    }
  }

  async readPrefix(key: string, maxBytes: number): Promise<Uint8Array | null> {
    try {
      const result = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=0-${maxBytes - 1}`,
        }),
      );
      const bytes = await result.Body?.transformToByteArray();
      return bytes ?? null;
    } catch (error) {
      if (isNotFound(error)) return null;
      this.logger.error({ err: error, key }, 'R2 GET range failed');
      throw new DomainException('STORAGE_ERROR', 'Could not read the uploaded object.');
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      this.logger.error({ err: error, key }, 'R2 DELETE failed');
      throw new DomainException('STORAGE_ERROR', 'Could not delete the object.');
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    try {
      let token: string | undefined;
      do {
        const list = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        const objects = (list.Contents ?? [])
          .map((item) => item.Key)
          .filter((key): key is string => Boolean(key))
          .map((Key) => ({ Key }));
        if (objects.length > 0) {
          await this.client.send(
            new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }),
          );
        }
        token = list.IsTruncated ? list.NextContinuationToken : undefined;
      } while (token);
    } catch (error) {
      this.logger.error({ err: error, prefix }, 'R2 prefix delete failed');
      throw new DomainException('STORAGE_ERROR', 'Could not delete uploaded objects.');
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error.name === 'NotFound' || error.name === 'NoSuchKey' || error.name === 'NotFoundException')
  );
}
