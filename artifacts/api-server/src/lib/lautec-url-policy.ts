const LAUTEC_ORIGIN = "https://dpr.lautec.com";
const LAUTEC_IDENTITY_ORIGIN = "https://identity.lautec.com";
const DEFAULT_APPROVED_PATH_PREFIXES = ["/", "/_RjXISwj7iY-/dpr-details"];

function approvedPathPrefixes(): string[] {
  const configured = process.env.LAUTEC_APPROVED_PATH_PREFIXES
    ?.split(",")
    .map((path) => path.trim())
    .filter((path) => path.startsWith("/"));
  return configured?.length ? configured : DEFAULT_APPROVED_PATH_PREFIXES;
}

export function validateLautecUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be a valid URL.";
  }
  if (url.protocol !== "https:") return "must use HTTPS.";
  if (url.origin !== LAUTEC_ORIGIN || url.username || url.password || url.port) {
    return "must use the approved https://dpr.lautec.com origin without credentials or a custom port.";
  }
  const allowed = approvedPathPrefixes();
  const approved = allowed.some((prefix) =>
    prefix === "/" ? url.pathname === "/" : url.pathname === prefix || url.pathname.startsWith(`${prefix}/`),
  );
  return approved ? null : "uses a Lautec path that is not approved for browser automation.";
}

export function assertApprovedLautecUrl(value: string): void {
  const error = validateLautecUrl(value);
  if (error) throw new Error(`Lautec browser blocked an unapproved URL: ${error}`);
}

export function validateLautecBrowserUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return "must be a valid URL.";
  }
  if (url.protocol !== "https:") return "must use HTTPS.";
  if (url.username || url.password || url.port) {
    return "must not contain credentials or a custom port.";
  }
  if (url.origin === LAUTEC_ORIGIN || url.origin === LAUTEC_IDENTITY_ORIGIN) return null;
  return validateLautecUrl(value);
}

export function assertApprovedLautecBrowserUrl(value: string): void {
  const error = validateLautecBrowserUrl(value);
  if (error) throw new Error(`Lautec browser blocked an unapproved URL: ${error}`);
}