import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { inArray } from "drizzle-orm";
import { db, appSettingsTable } from "@workspace/db";
import { driveRequest } from "./google-drive.js";

const DB_KEYS = [
  "wasabi_access_key_id",
  "wasabi_secret_access_key",
  "wasabi_bucket_name",
  "wasabi_region",
] as const;

interface WasabiCreds {
  accessKeyId:     string;
  secretAccessKey: string;
  bucket:          string;
  region:          string;
}

let _cache: WasabiCreds | null = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

let _client: S3Client | null = null;
let _clientFingerprint = "";

export function invalidateCredsCache(): void {
  _cache = null;
  _cacheExpiry = 0;
  _client = null;
  _clientFingerprint = "";
}

async function loadCredsFromDb(): Promise<Partial<WasabiCreds>> {
  try {
    const rows = await db
      .select()
      .from(appSettingsTable)
      .where(inArray(appSettingsTable.key, DB_KEYS as unknown as string[]));

    const m: Record<string, string> = {};
    for (const r of rows) m[r.key] = r.value;

    return {
      accessKeyId:     m["wasabi_access_key_id"]     || undefined,
      secretAccessKey: m["wasabi_secret_access_key"] || undefined,
      bucket:          m["wasabi_bucket_name"]        || undefined,
      region:          m["wasabi_region"]             || undefined,
    };
  } catch {
    return {};
  }
}

async function loadCreds(): Promise<WasabiCreds | null> {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  const dbCreds = await loadCredsFromDb();

  const accessKeyId     = dbCreds.accessKeyId     ?? process.env["WASABI_ACCESS_KEY_ID"]     ?? "";
  const secretAccessKey = dbCreds.secretAccessKey ?? process.env["WASABI_SECRET_ACCESS_KEY"] ?? "";
  const bucket          = dbCreds.bucket          ?? process.env["WASABI_BUCKET_NAME"]        ?? "";
  const region          = dbCreds.region          ?? process.env["WASABI_REGION"]             ?? "eu-west-1";

  if (!accessKeyId || !secretAccessKey || !bucket) {
    _cache = null;
    _cacheExpiry = now + CACHE_TTL_MS;
    return null;
  }

  _cache = { accessKeyId, secretAccessKey, bucket, region };
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cache;
}

async function getWasabiClient(): Promise<S3Client> {
  const creds = await loadCreds();
  if (!creds) throw new Error("Wasabi credentials not configured");

  const fingerprint = `${creds.accessKeyId}:${creds.bucket}:${creds.region}`;
  if (_client && fingerprint === _clientFingerprint) return _client;

  const endpoint = `https://s3.${creds.region}.wasabisys.com`;
  _client = new S3Client({
    region: creds.region,
    endpoint,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    forcePathStyle: false,
  });
  _clientFingerprint = fingerprint;
  return _client;
}

export async function isWasabiConfigured(): Promise<boolean> {
  const creds = await loadCreds();
  return creds !== null;
}

/** Returns the public URL for a given Wasabi object key. */
export async function wasabiPublicUrl(key: string): Promise<string> {
  const creds = await loadCreds();
  const bucket = creds?.bucket ?? process.env["WASABI_BUCKET_NAME"] ?? "";
  const region = creds?.region ?? process.env["WASABI_REGION"]      ?? "eu-west-1";
  return `https://${bucket}.s3.${region}.wasabisys.com/${key}`;
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
  const creds  = await loadCreds();
  if (!creds) throw new Error("Wasabi credentials not configured");
  const client = await getWasabiClient();

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
      Bucket:      creds.bucket,
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
    const creds  = await loadCreds();
    if (!creds) return { ok: false, error: "Not configured" };
    const client = await getWasabiClient();
    await client.send(new HeadBucketCommand({ Bucket: creds.bucket }));
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
