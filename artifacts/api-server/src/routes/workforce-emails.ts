import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, isNotNull, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  db,
  emailLogsTable,
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

const router: IRouter = Router();

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.userId) { res.status(401).json({ error: "Authentication required" }); return; }
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.accessLevel !== "admin") { res.status(403).json({ error: "Admin access required" }); return; }
  next();
}

function buildTrackingPixelUrl(req: Request, trackingId: string): string {
  const proto = req.headers["x-forwarded-proto"] ?? (req.secure ? "https" : "http");
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  return `${proto}://${host}/api/workforce/emails/track/${trackingId}.gif`;
}

// ── GET /workforce/emails/logs ────────────────────────────────────────────────
router.get("/workforce/emails/logs", requireAdmin, async (req, res): Promise<void> => {
  try {
    const { workerId, emailType, limit: limitParam } = req.query as Record<string, string>;
    const limit = Math.min(parseInt(limitParam ?? "100") || 100, 500);

    const conditions = [];
    if (workerId) conditions.push(eq(emailLogsTable.workerId, parseInt(workerId)));
    if (emailType) conditions.push(eq(emailLogsTable.emailType, emailType));

    const logs = await db.select({
      log: emailLogsTable,
      workerName: workersTable.name,
    })
      .from(emailLogsTable)
      .leftJoin(workersTable, eq(emailLogsTable.workerId, workersTable.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(emailLogsTable.sentAt))
      .limit(limit);

    res.json(logs.map(r => ({ ...r.log, workerName: r.workerName ?? null })));
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
    const { emailType, workerIds, subject, bodyHtml, loginUrl, username, temporaryPassword, daysThreshold } = req.body as {
      emailType: string;
      workerIds: number[];
      subject?: string;
      bodyHtml?: string;
      loginUrl?: string;
      username?: string;
      temporaryPassword?: string;
      daysThreshold?: number;
    };

    if (!emailType || !Array.isArray(workerIds) || workerIds.length === 0) {
      res.status(400).json({ error: "emailType and workerIds[] are required" });
      return;
    }

    const targetWorkers = await db.select().from(workersTable)
      .where(inArray(workersTable.id, workerIds));

    const results: { workerId: number; workerName: string; email: string | null; status: string; error?: string }[] = [];

    for (const worker of targetWorkers) {
      if (!worker.email) {
        results.push({ workerId: worker.id, workerName: worker.name, email: null, status: "skipped", error: "No email address" });
        continue;
      }

      const trackingId = randomUUID();
      const trackingPixelUrl = buildTrackingPixelUrl(req, trackingId);

      let emailSubject = subject ?? "";
      let finalHtml = "";

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
          results.push({ workerId: worker.id, workerName: worker.name, email: worker.email, status: "skipped", error: "No expiring certifications" });
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
      } else if (emailType === "login_info") {
        if (!loginUrl || !username || !temporaryPassword) {
          res.status(400).json({ error: "loginUrl, username, temporaryPassword are required for login_info emails" });
          return;
        }
        emailSubject = emailSubject || "Your Workforce Compliance Manager Account";
        finalHtml = buildLoginInfoHtml({ workerName: worker.name, loginUrl, username, temporaryPassword, trackingPixelUrl });
      } else if (emailType === "custom") {
        if (!subject || !bodyHtml) {
          res.status(400).json({ error: "subject and bodyHtml are required for custom emails" });
          return;
        }
        finalHtml = buildCustomEmailHtml({ bodyHtml, trackingPixelUrl });
      } else {
        res.status(400).json({ error: `Unknown emailType: ${emailType}` });
        return;
      }

      const sendResult = await sendEmail({
        toEmail: worker.email,
        toName: worker.name,
        subject: emailSubject,
        htmlBody: finalHtml,
      });

      await db.insert(emailLogsTable).values({
        workerId: worker.id,
        sentBy: req.session!.userId as number,
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
        email: worker.email,
        status: sendResult.success ? "sent" : "failed",
        error: sendResult.error,
      });
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
