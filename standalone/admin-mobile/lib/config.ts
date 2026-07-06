// Set this to the domain where your Workforce Compliance backend is running,
// e.g. "workforce.spx.site" or "your-repl-name.your-username.replit.app".
// Do not include "https://" or a trailing slash.
export const API_DOMAIN = "workforce.spx.site";

export function getBaseUrl(): string {
  return `https://${API_DOMAIN}`;
}
