import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, isNotNull, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  emailLogsTable,
  pushLogsTable,
  workerPushTokensTable,
  workersTable,
  workerCertificationsTable,
  certificationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger.js";
import {
  sendEmail,
  buildExpiryNotificationHtml,
  buildLoginInfoHtml,
  buildCustomEmailHtml,
} from "../lib/mailjet.js";
import {
  sendPushToTokens,
  buildExpiryNotificationPush,
  buildLoginInfoPush,
  buildCustomPush,
} from "../lib/push.js";

const CHANNELS = ["email", "push"] as const;
type Channel = (typeof CHANNELS)[number];

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || !req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || req.session?.accessLevel !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

function buildTrackingPixelUrl(req: Request, trackingId: string): string {
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}/api/workforce/emails/track/${trackingId}.gif`;
}

// ── GET /workforce/emails/logs ────────────────────────────────────────────────
// Merges email_logs and push_logs into one list of "messages", grouping rows that
// share a batchId + workerId (i.e. were sent together from the same admin action)
// into a single entry with one delivery-status entry per channel.
interface ChannelResult {
  channel: Channel;
  status: string;
  error: string | null;
  seenAt?: string | null;
  seenIp?: string | null;
}
interface MessageLog {
  id: string;
  workerId: number | null;
  workerName: string | null;
  toEmail: string | null;
  subject: string;
  messageType: string;
  sentAt: string;
  channels: ChannelResult[];
}

router.get("/workforce/emails/logs", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { workerId, emailType, limit: limitParam } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(limitParam ?? "100") || 100, 500);

    const emailConditions = [];
    if (workerId) emailConditions.push(eq(emailLogsTable.workerId, parseInt(workerId)));
    if (emailType) emailConditions.push(eq(emailLogsTable.emailType, emailType));

    const pushConditions = [];
    if (workerId) pushConditions.push(eq(pushLogsTable.workerId, parseInt(workerId)));
    if (emailType) pushConditions.push(eq(pushLogsTable.messageType, emailType));

    const [emailRows, pushRows] = await Promise.all([
      db.select({ log: emailLogsTable, workerName: workersTable.name })
        .from(emailLogsTable)
        .leftJoin(workersTable, eq(emailLogsTable.workerId, workersTable.id))
        .where(emailConditions.length > 0 ? and(...emailConditions) : undefined)
        .orderBy(desc(emailLogsTable.sentAt))
        .limit(limit * 2),
      db.select({ log: pushLogsTable, workerName: workersTable.name })
        .from(pushLogsTable)
        .leftJoin(workersTable, eq(pushLogsTable.workerId, workersTable.id))
        .where(pushConditions.length > 0 ? and(...pushConditions) : undefined)
        .orderBy(desc(pushLogsTable.sentAt))
        .limit(limit * 2),
    ]);

    const groups = new Map<string, MessageLog>();

    for (const r of emailRows) {
      const key = r.log.batchId ? `${r.log.batchId}:${r.log.workerId}` : `email-${r.log.id}`;
      const existing = groups.get(key);
      const channelResult: ChannelResult = {
        channel: "email",
        status: r.log.status,
        error: r.log.error,
        seenAt: r.log.seenAt ? r.log.seenAt.toISOString() : null,
        seenIp: r.log.seenIp,
      };
      if (existing) {
        existing.channels.push(channelResult);
        if (r.log.sentAt.toISOString() > existing.sentAt) existing.sentAt = r.log.sentAt.toISOString();
      } else {
        groups.set(key, {
          id: key,
          workerId: r.log.workerId,
          workerName: r.workerName ?? null,
          toEmail: r.log.toEmail,
          subject: r.log.subject,
          messageType: r.log.emailType,
          sentAt: r.log.sentAt.toISOString(),
          channels: [channelResult],
        });
      }
    }

    for (const r of pushRows) {
      const key = r.log.batchId ? `${r.log.batchId}:${r.log.workerId}` : `push-${r.log.id}`;
      const existing = groups.get(key);
      const channelResult: ChannelResult = { channel: "push", status: r.log.status, error: r.log.error };
      if (existing) {
        existing.channels.push(channelResult);
        if (r.log.sentAt.toISOString() > existing.sentAt) existing.sentAt = r.log.sentAt.toISOString();
      } else {
        groups.set(key, {
          id: key,
          workerId: r.log.workerId,
          workerName: r.workerName ?? null,
          toEmail: null,
          subject: r.log.title,
          messageType: r.log.messageType,
          sentAt: r.log.sentAt.toISOString(),
          channels: [channelResult],
        });
      }
    }

    const merged = [...groups.values()]
      .sort((a, b) => (a.sentAt < b.sentAt ? 1 : -1))
      .slice(0, limit);

    res.json(merged);
  } catch (err) {
    logger.error({ err }, "workforce emails logs GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /workforce/emails/send ───────────────────────────────────────────────
// Body for "custom":          { emailType: "custom", workerIds: number[], subject, bodyHtml }
// Body for "expiry_notification": { emailType: "expiry_notification", workerIds: number[], daysThreshold?: number }
// Body for "login_info":      { emailType: "login_info", workerIds: number[], loginUrl, username, temporaryPassword }
router.post("/workforce/emails/send", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { emailType, workerIds, subject, bodyHtml, loginUrl, username, temporaryPassword, daysThreshold, channels: rawChannels } = req.body as {
      emailType: string;
      workerIds: number[];
      subject?: string;
      bodyHtml?: string;
      loginUrl?: string;
      username?: string;
      temporaryPassword?: string;
      daysThreshold?: number;
      channels?: string[];
    };

    if (!emailType || !Array.isArray(workerIds) || workerIds.length === 0) {
      res.status(400).json({ error: "emailType and workerIds[] are required" });
      return;
    }

    const channels = (Array.isArray(rawChannels) && rawChannels.length > 0 ? rawChannels : ["email"])
      .filter((c): c is Channel => (CHANNELS as readonly string[]).includes(c));
    if (channels.length === 0) {
      res.status(400).json({ error: "At least one valid channel (email, push) is required" });
      return;
    }
    const wantEmail = channels.includes("email");
    const wantPush = channels.includes("push");
    const batchId = randomUUID();

    const targetWorkers = await db.select().from(workersTable)
      .where(inArray(workersTable.id, workerIds));

    const workerPushTokens = wantPush
      ? await db.select().from(workerPushTokensTable).where(inArray(workerPushTokensTable.workerId, workerIds))
      : [];
    const tokensByWorker = new Map<number, string[]>();
    for (const t of workerPushTokens) {
      const list = tokensByWorker.get(t.workerId) ?? [];
      list.push(t.token);
      tokensByWorker.set(t.workerId, list);
    }

    if (emailType === "login_info" && wantEmail && (!loginUrl || !username || !temporaryPassword)) {
      res.status(400).json({ error: "loginUrl, username, temporaryPassword are required for login_info emails" });
      return;
    }
    if (emailType === "custom" && (!subject || !bodyHtml)) {
      res.status(400).json({ error: "subject and bodyHtml are required for custom messages" });
      return;
    }
    if (!["expiry_notification", "login_info", "custom"].includes(emailType)) {
      res.status(400).json({ error: `Unknown emailType: ${emailType}` });
      return;
    }

    const results: { workerId: number; workerName: string; channel: Channel; status: string; error?: string }[] = [];

    for (const worker of targetWorkers) {
      const trackingId = randomUUID();
      const trackingPixelUrl = buildTrackingPixelUrl(req, trackingId);

      let emailSubject = subject ?? "";
      let finalHtml = "";
      let pushCopy: { title: string; body: string } | null = null;

      if (emailType === "expiry_notification") {
        const threshold = daysThreshold ?? 60;
        const today = new Date();
        const cutoff = new Date(today);
        cutoff.setDate(cutoff.getDate() + threshold);

        const expiring = await db.select({ wc: workerCertificationsTable, cert: certificationsTable })
          .from(workerCertificationsTable)
          .innerJoin(certificationsTable, eq(workerCertificationsTable.certificationId, certificationsTable.id))
          .where(and(
            eq(workerCertificationsTable.workerId, worker.id),
            isNotNull(workerCertificationsTable.expiryDate),
          ));

        const expiringSoon = expiring.filter(r => {
          if (!r.wc.expiryDate) return false;
          const exp = new Date(r.wc.expiryDate);
          return exp >= today && exp <= cutoff;
        });

        if (expiringSoon.length === 0) {
          for (const channel of channels) {
            results.push({ workerId: worker.id, workerName: worker.name, channel, status: "skipped", error: "No expiring certifications" });
          }
          continue;
        }

        emailSubject = emailSubject || "Action Required: Certifications Expiring Soon";
        finalHtml = buildExpiryNotificationHtml({
          workerName: worker.name,
          certifications: expiringSoon.map(r => ({
            name: r.cert.name,
            category: r.cert.category,
            expiryDate: r.wc.expiryDate ? new Date(r.wc.expiryDate).toLocaleDateString("en-GB") : "Unknown",
          })),
          trackingPixelUrl,
        });
        pushCopy = buildExpiryNotificationPush({ count: expiringSoon.length });
      } else if (emailType === "login_info") {
        emailSubject = emailSubject || "Your Workforce Compliance Manager Account";
        if (wantEmail) {
          finalHtml = buildLoginInfoHtml({ workerName: worker.name, loginUrl: loginUrl!, username: username!, temporaryPassword: temporaryPassword!, trackingPixelUrl });
        }
        // Never include the temporary password in the push payload — direct the worker to email instead.
        pushCopy = buildLoginInfoPush();
      } else {
        // custom
        if (wantEmail) finalHtml = buildCustomEmailHtml({ bodyHtml: bodyHtml!, trackingPixelUrl });
        pushCopy = buildCustomPush({ subject: emailSubject, textBody: (bodyHtml ?? "").replace(/<[^>]+>/g, " ") });
      }

      if (wantEmail) {
        if (!worker.email) {
          results.push({ workerId: worker.id, workerName: worker.name, channel: "email", status: "skipped", error: "No email address" });
        } else {
          const sendResult = await sendEmail({
            toEmail: worker.email,
            toName: worker.name,
            subject: emailSubject,
            htmlBody: finalHtml,
          });

          await db.insert(emailLogsTable).values({
            workerId: worker.id,
            sentBy: req.session!.userId as number,
            batchId,
            toEmail: worker.email,
            toName: worker.name,
            subject: emailSubject,
            bodyHtml: finalHtml,
            emailType,
            status: sendResult.success ? "sent" : "failed",
            error: sendResult.error ?? null,
            trackingId,
          });

          results.push({
            workerId: worker.id,
            workerName: worker.name,
            channel: "email",
            status: sendResult.success ? "sent" : "failed",
            error: sendResult.error,
          });
        }
      }

      if (wantPush) {
        const tokens = tokensByWorker.get(worker.id) ?? [];
        if (tokens.length === 0) {
          await db.insert(pushLogsTable).values({
            workerId: worker.id,
            sentBy: req.session!.userId as number,
            batchId,
            title: pushCopy?.title ?? emailSubject,
            body: pushCopy?.body ?? "",
            messageType: emailType,
            status: "skipped",
            error: "No push token registered",
          });
          results.push({ workerId: worker.id, workerName: worker.name, channel: "push", status: "skipped", error: "No push token registered" });
        } else {
          const pushResult = await sendPushToTokens({
            tokens,
            title: pushCopy?.title ?? emailSubject,
            body: pushCopy?.body ?? "",
            data: { messageType: emailType },
          });

          await db.insert(pushLogsTable).values({
            workerId: worker.id,
            sentBy: req.session!.userId as number,
            batchId,
            title: pushCopy?.title ?? emailSubject,
            body: pushCopy?.body ?? "",
            messageType: emailType,
            status: pushResult.success ? "sent" : "failed",
            error: pushResult.error ?? null,
          });

          results.push({
            workerId: worker.id,
            workerName: worker.name,
            channel: "push",
            status: pushResult.success ? "sent" : "failed",
            error: pushResult.error,
          });
        }
      }
    }

    res.json({ results });
  } catch (err) {
    logger.error({ err }, "workforce emails send POST error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /workforce/emails/track/:trackingId.gif ───────────────────────────────
// Public endpoint — records email open event and returns 1×1 transparent GIF
router.get("/workforce/emails/track/:trackingId", async (req, res): Promise<void> => {
  try {
    const rawId = req.params.trackingId ?? "";
    // Strip optional .gif extension
    const trackingId = rawId.replace(/\.gif$/i, "");

    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? null;

    // Only update if not yet seen
    await db.update(emailLogsTable)
      .set({ seenAt: new Date(), seenIp: ip })
      .where(and(eq(emailLogsTable.trackingId, trackingId)));

    // 1×1 transparent GIF
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.end(gif);
  } catch {
    // Silently return the pixel even on error
    const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    res.setHeader("Content-Type", "image/gif");
    res.end(gif);
  }
});

// ── GET /workforce/emails/expiring-preview ────────────────────────────────────
// Returns workers with expiring certs so the admin can preview before sending
router.get("/workforce/emails/expiring-preview", requireAdmin, async (req, res): Promise<void> => {
  try {
    const days = parseInt((req.query.days as string) ?? "60") || 60;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const cutoff = new Date(today);
    cutoff.setDate(cutoff.getDate() + days);

    const rows = await db.select({
      wc: workerCertificationsTable,
      cert: certificationsTable,
      worker: workersTable,
    })
      .from(workerCertificationsTable)
      .innerJoin(certificationsTable, eq(workerCertificationsTable.certificationId, certificationsTable.id))
      .innerJoin(workersTable, eq(workerCertificationsTable.workerId, workersTable.id))
      .where(and(isNotNull(workerCertificationsTable.expiryDate), eq(workersTable.active, true)));

    const expiring = rows.filter(r => {
      if (!r.wc.expiryDate) return false;
      const exp = new Date(r.wc.expiryDate);
      return exp >= today && exp <= cutoff;
    });

    // Group by worker
    const workerMap = new Map<number, { workerId: number; workerName: string; email: string | null; certifications: { name: string; expiryDate: string }[] }>();
    for (const r of expiring) {
      if (!workerMap.has(r.worker.id)) {
        workerMap.set(r.worker.id, { workerId: r.worker.id, workerName: r.worker.name, email: r.worker.email ?? null, certifications: [] });
      }
      workerMap.get(r.worker.id)!.certifications.push({
        name: r.cert.name,
        expiryDate: r.wc.expiryDate ? new Date(r.wc.expiryDate).toLocaleDateString("en-GB") : "",
      });
    }

    res.json([...workerMap.values()]);
  } catch (err) {
    logger.error({ err }, "workforce emails expiring-preview error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
