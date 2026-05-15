import Mailjet from "node-mailjet";
import { logger } from "./logger.js";

const apiKey = process.env.MAILJET_API_KEY ?? "";
const apiSecret = process.env.MAILJET_SECRET_KEY ?? "";
const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? "noreply@example.com";
const fromName = process.env.EMAIL_FROM_NAME ?? "Workforce Compliance Manager";

export interface SendEmailOptions {
  toEmail: string;
  toName: string;
  subject: string;
  htmlBody: string;
  textBody?: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  if (!apiKey || !apiSecret) {
    logger.warn("Mailjet credentials not configured — email not sent");
    return { success: false, error: "Mailjet credentials not configured" };
  }

  try {
    const mj = new Mailjet.Client({ apiKey, apiSecret });

    await mj.post("send", { version: "v3.1" }).request({
      Messages: [
        {
          From: { Email: fromEmail, Name: fromName },
          To: [{ Email: opts.toEmail, Name: opts.toName }],
          Subject: opts.subject,
          HTMLPart: opts.htmlBody,
          TextPart: opts.textBody ?? stripHtml(opts.htmlBody),
        },
      ],
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Mailjet send error");
    return { success: false, error: message };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Email HTML templates

export function buildExpiryNotificationHtml(opts: {
  workerName: string;
  certifications: { name: string; category: string | null; expiryDate: string }[];
  trackingPixelUrl: string;
}): string {
  const rows = opts.certifications
    .map(
      (c) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;">${c.name}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;">${c.category ?? "—"}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#dc2626;font-weight:600;">${c.expiryDate}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:24px;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;">Certification Expiry Notice</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#111827;margin-top:0;">Dear <strong>${opts.workerName}</strong>,</p>
      <p style="color:#374151;">The following certifications are expiring soon and require your attention:</p>
      <table style="width:100%;border-collapse:collapse;margin:16px 0;">
        <thead>
          <tr style="background:#f3f4f6;">
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Certification</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Category</th>
            <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Expires</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="color:#374151;">Please arrange renewal as soon as possible to maintain your compliance status.</p>
      <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This is an automated message from the Workforce Compliance Manager.
      </p>
    </div>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}

export function buildLoginInfoHtml(opts: {
  workerName: string;
  loginUrl: string;
  username: string;
  temporaryPassword: string;
  trackingPixelUrl: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:24px;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;">Your Account Details</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#111827;margin-top:0;">Dear <strong>${opts.workerName}</strong>,</p>
      <p style="color:#374151;">Your Workforce Compliance Manager account has been set up. Here are your login details:</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#374151;"><strong>Login URL:</strong> <a href="${opts.loginUrl}" style="color:#1d4ed8;">${opts.loginUrl}</a></p>
        <p style="margin:0 0 8px;color:#374151;"><strong>Username:</strong> ${opts.username}</p>
        <p style="margin:0;color:#374151;"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;">${opts.temporaryPassword}</code></p>
      </div>
      <p style="color:#dc2626;font-size:13px;">Please change your password after your first login.</p>
      <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This is an automated message from the Workforce Compliance Manager.
      </p>
    </div>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}

export function buildCustomEmailHtml(opts: {
  bodyHtml: string;
  trackingPixelUrl: string;
}): string {
  // Inject tracking pixel into custom body
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:24px;">
      ${opts.bodyHtml}
      <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This is a message from the Workforce Compliance Manager.
      </p>
    </div>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}
