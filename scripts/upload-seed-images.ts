import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

if (existsSync('.env')) process.loadEnvFile('.env');

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET;
if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
  throw new Error('R2_* environment variables are required');
}

const client = new S3Client({
  region: 'auto',
  endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId, secretAccessKey },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'seed-images');
const files = (await readdir(dir)).filter((name) => name.endsWith('.webp'));

for (const file of files) {
  const key = `seed/${file}`;
  try {
    await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    console.log(`skip ${key}`);
    continue;
  } catch {
    // missing — upload
  }
  const body = await readFile(join(dir, file));
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: 'image/webp',
    }),
  );
  console.log(`uploaded ${key}`);
}
