import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { driveRequest } from "./google-drive.js";

const REGION   = process.env["WASABI_REGION"]     ?? "eu-west-1";
const ENDPOINT = `https://s3.${REGION}.wasabisys.com`;
const BUCKET   = process.env["WASABI_BUCKET_NAME"] ?? "";

let _client: S3Client | null = null;

export function getWasabiClient(): S3Client {
  if (_client) return _client;
  const accessKeyId     = process.env["WASABI_ACCESS_KEY_ID"];
  const secretAccessKey = process.env["WASABI_SECRET_ACCESS_KEY"];
  if (!accessKeyId || !secretAccessKey || !BUCKET) {
    throw new Error("WASABI_ACCESS_KEY_ID, WASABI_SECRET_ACCESS_KEY and WASABI_BUCKET_NAME must be set");
  }
  _client = new S3Client({
    region: REGION,
    endpoint: ENDPOINT,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: false,
  });
  return _client;
}

export function isWasabiConfigured(): boolean {
  return !!(
    process.env["WASABI_ACCESS_KEY_ID"] &&
    process.env["WASABI_SECRET_ACCESS_KEY"] &&
    process.env["WASABI_BUCKET_NAME"]
  );
}

/** Returns the public URL for a given Wasabi object key. */
export function wasabiPublicUrl(key: string): string {
  return `https://${BUCKET}.s3.${REGION}.wasabisys.com/${key}`;
}

/** Content-type → file extension */
function extFromContentType(ct: string): string {
  if (ct.includes("png"))  return ".png";
  if (ct.includes("gif"))  return ".gif";
  if (ct.includes("webp")) return ".webp";
  if (ct.includes("bmp"))  return ".bmp";
  if (ct.includes("tiff")) return ".tiff";
  if (ct.includes("heic")) return ".heic";
  return ".jpg";
}

/**
 * Downloads an image from Google Drive and uploads it to Wasabi.
 * Returns the Wasabi object key.
 * Throws on any failure.
 */
export async function uploadToWasabi(driveFileId: string, photoId: string): Promise<string> {
  const client = getWasabiClient();

  const driveResp = await driveRequest(
    `/files/${driveFileId}`,
    new URLSearchParams({ alt: "media", supportsAllDrives: "true" }),
  );

  if (!driveResp.ok) {
    throw new Error(`Drive returned ${driveResp.status} for fileId ${driveFileId}`);
  }

  const contentType = driveResp.headers.get("content-type") ?? "image/jpeg";
  const ext         = extFromContentType(contentType);
  const key         = `photos/${photoId}${ext}`;
  const body        = Buffer.from(await driveResp.arrayBuffer());

  await client.send(
    new PutObjectCommand({
      Bucket:      BUCKET,
      Key:         key,
      Body:        body,
      ContentType: contentType,
    }),
  );

  return key;
}

/** Quick connectivity check — verifies the bucket is accessible. */
export async function checkWasabiConnection(): Promise<{ ok: boolean; error?: string }> {
  try {
    const client = getWasabiClient();
    await client.send(new HeadBucketCommand({ Bucket: BUCKET }));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
