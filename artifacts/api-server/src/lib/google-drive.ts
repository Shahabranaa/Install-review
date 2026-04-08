import { JWT } from "google-auth-library";

const DRIVE_API = "https://www.googleapis.com/drive/v3";

function getJwtClient(): JWT {
  const email = process.env["GOOGLE_DRIVE_CLIENT_EMAIL"];
  const rawKey = process.env["GOOGLE_DRIVE_PRIVATE_KEY"];

  if (!email || !rawKey) {
    throw new Error(
      "GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY must be set",
    );
  }

  const key = rawKey.replace(/\\n/g, "\n");

  return new JWT({
    email,
    key,
    scopes: [
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

export async function driveRequest(
  path: string,
  params?: URLSearchParams,
): Promise<Response> {
  const client = getJwtClient();
  const tokenResponse = await client.getAccessToken();
  const token = tokenResponse.token;

  if (!token) {
    throw new Error("Failed to obtain Google access token");
  }

  const url = params
    ? `${DRIVE_API}${path}?${params.toString()}`
    : `${DRIVE_API}${path}`;

  return fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export function isDriveConfigured(): boolean {
  return !!(
    process.env["GOOGLE_DRIVE_CLIENT_EMAIL"] &&
    process.env["GOOGLE_DRIVE_PRIVATE_KEY"]
  );
}
