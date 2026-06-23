import sgMail from "@sendgrid/mail";
import { logger } from "./logger.js";

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
  const apiKey = process.env.SENDGRID_API_KEY ?? "";
  const fromEmail = process.env.EMAIL_FROM_ADDRESS ?? "";

  if (!apiKey) {
    logger.warn("SENDGRID_API_KEY not configured — email not sent");
    return { success: false, error: "SENDGRID_API_KEY not configured" };
  }
  if (!fromEmail) {
    logger.warn("EMAIL_FROM_ADDRESS not configured — email not sent");
    return { success: false, error: "EMAIL_FROM_ADDRESS not configured" };
  }

  try {
    sgMail.setApiKey(apiKey);

    await sgMail.send({
      to: { email: opts.toEmail, name: opts.toName },
      from: { email: fromEmail, name: process.env.EMAIL_FROM_NAME ?? "Workforce Compliance Manager" },
      subject: opts.subject,
      html: opts.htmlBody,
      text: opts.textBody ?? stripHtml(opts.htmlBody),
    });

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "SendGrid send error");
    return { success: false, error: message };
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// ── Email HTML templates ──────────────────────────────────────────────────────

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
        This is an automated message from Workforce Compliance Manager. For help, contact <a href="mailto:andy@smart-projex.com" style="color:#1d4ed8;">andy@smart-projex.com</a>.
      </p>
    </div>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}

export function buildSetupLinkHtml(opts: {
  workerName: string;
  setupUrl: string;
  trackingPixelUrl: string;
  supportEmail?: string;
}): string {
  const support = opts.supportEmail ?? process.env.EMAIL_FROM_ADDRESS ?? "support@example.com";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background:#1d4ed8;padding:24px;">
      <h1 style="color:#ffffff;margin:0;font-size:20px;">Welcome to Workforce Compliance Manager</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#111827;margin-top:0;">Hi <strong>${opts.workerName}</strong>,</p>
      <p style="color:#374151;">You've been enrolled on <strong>Workforce Compliance Manager</strong> — the portal where you manage your certifications, schedule, and deployment details. Click the button below to set your password and get started. This link expires in 48 hours and can only be used once.</p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${opts.setupUrl}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:6px;font-size:15px;font-weight:600;">Set up your account &rarr;</a>
      </div>
      <div style="background:#f3f4f6;border-radius:8px;padding:18px;margin:16px 0;">
        <p style="margin:0 0 10px;color:#111827;font-weight:600;font-size:13px;">Your first steps once you're in:</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="width:28px;vertical-align:top;padding:4px 0;color:#1d4ed8;font-weight:700;font-size:13px;">1.</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;"><strong>Set your password</strong> — click the button above to choose a secure password.</td>
          </tr>
          <tr>
            <td style="width:28px;vertical-align:top;padding:4px 0;color:#1d4ed8;font-weight:700;font-size:13px;">2.</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;"><strong>Upload your certifications</strong> — go to the Certs tab and upload your current certificates so your compliance record is up to date.</td>
          </tr>
          <tr>
            <td style="width:28px;vertical-align:top;padding:4px 0;color:#1d4ed8;font-weight:700;font-size:13px;">3.</td>
            <td style="padding:4px 0;color:#374151;font-size:13px;"><strong>Set your departure airports</strong> — update your profile so we know where to mobilise you from.</td>
          </tr>
        </table>
      </div>
      <p style="color:#6b7280;font-size:12px;margin-top:16px;">If the button above doesn't work, copy and paste this link into your browser:<br><a href="${opts.setupUrl}" style="color:#1d4ed8;word-break:break-all;">${opts.setupUrl}</a></p>
      <p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        If you weren't expecting this email, please contact <a href="mailto:${support}" style="color:#1d4ed8;">${support}</a> and we'll sort it out. Do not click the link above if you weren't expecting this invitation.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:8px;">
        Need help getting started? Reach us at <a href="mailto:${support}" style="color:#1d4ed8;">${support}</a>.
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
      <h1 style="color:#ffffff;margin:0;font-size:20px;">Your Workforce Compliance Manager Account</h1>
    </div>
    <div style="padding:24px;">
      <p style="color:#111827;margin-top:0;">Dear <strong>${opts.workerName}</strong>,</p>
      <p style="color:#374151;">Your <strong>Workforce Compliance Manager</strong> account has been set up. Here are your login details:</p>
      <div style="background:#f3f4f6;border-radius:6px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 8px;color:#374151;"><strong>Login URL:</strong> <a href="${opts.loginUrl}" style="color:#1d4ed8;">${opts.loginUrl}</a></p>
        <p style="margin:0 0 8px;color:#374151;"><strong>Username:</strong> ${opts.username}</p>
        <p style="margin:0;color:#374151;"><strong>Temporary Password:</strong> <code style="background:#e5e7eb;padding:2px 6px;border-radius:4px;">${opts.temporaryPassword}</code></p>
      </div>
      <p style="color:#dc2626;font-size:13px;">Please change your password after your first login. This temporary password will expire in 48 hours.</p>
      <p style="color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;padding-top:16px;margin-top:24px;">
        If you weren't expecting this email, please contact <a href="mailto:andy@smart-projex.com" style="color:#1d4ed8;">andy@smart-projex.com</a> and we'll sort it out.
      </p>
      <p style="color:#6b7280;font-size:12px;margin-top:8px;">
        Need help? Reach us at <a href="mailto:andy@smart-projex.com" style="color:#1d4ed8;">andy@smart-projex.com</a>.
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
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Arial,sans-serif;background:#f9fafb;margin:0;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="padding:24px;">
      ${opts.bodyHtml}
      <p style="color:#6b7280;font-size:13px;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:16px;">
        This is a message from Workforce Compliance Manager. For help, contact <a href="mailto:andy@smart-projex.com" style="color:#1d4ed8;">andy@smart-projex.com</a>.
      </p>
    </div>
  </div>
  <img src="${opts.trackingPixelUrl}" width="1" height="1" style="display:none;" alt="">
</body>
</html>`;
}
