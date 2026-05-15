import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, sql, count } from "drizzle-orm";
import {
  db,
  requiredImageDefinitionsTable,
  phasesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.session?.sessionType === "worker" || req.session?.accessLevel !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export interface TemplateSlot {
  reqImgType: string;
  reqImgOrder: string | null;
  description: string | null;
}

export interface PhaseTemplate {
  phaseType: string;
  locationType: string;
  slots: TemplateSlot[];
  locationCount: number;
  imageCount: number;
}

// ── GET /api/phase-templates ────────────────────────────────────────────────
router.get("/phase-templates", requireAdmin, async (_req, res): Promise<void> => {
  try {
    const defs = await db
      .select()
      .from(requiredImageDefinitionsTable)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgOrder, requiredImageDefinitionsTable.reqImgType);

    // Group by phaseType
    const templateMap = new Map<string, PhaseTemplate>();
    for (const def of defs) {
      if (!templateMap.has(def.phaseType)) {
        templateMap.set(def.phaseType, {
          phaseType: def.phaseType,
          locationType: def.locationType,
          slots: [],
          locationCount: 0,
          imageCount: 0,
        });
      }
      const t = templateMap.get(def.phaseType)!;
      t.slots.push({ reqImgType: def.reqImgType, reqImgOrder: def.reqImgOrder, description: def.description });
    }

    // Count active phases per phaseType
    const phaseCounts = await db
      .select({
        phaseType: phasesTable.phaseType,
        cnt: count(phasesTable.id),
      })
      .from(phasesTable)
      .groupBy(phasesTable.phaseType);

    for (const pc of phaseCounts) {
      const t = templateMap.get(pc.phaseType);
      if (t) t.locationCount = Number(pc.cnt);
    }

    const templates = Array.from(templateMap.values()).map((t) => ({
      ...t,
      imageCount: t.slots.length,
    }));

    res.json(templates);
  } catch (err) {
    logger.error({ err }, "phase-templates GET error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/phase-templates ───────────────────────────────────────────────
router.post("/phase-templates", requireAdmin, async (req, res): Promise<void> => {
  const { phaseType, locationType, slots } = req.body as {
    phaseType?: string;
    locationType?: string;
    slots?: TemplateSlot[];
  };

  if (!phaseType?.trim()) {
    res.status(400).json({ error: "phaseType is required" });
    return;
  }
  if (!locationType || !["TP", "OSP", "both"].includes(locationType)) {
    res.status(400).json({ error: "locationType must be TP, OSP, or both" });
    return;
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    res.status(400).json({ error: "At least one image slot is required" });
    return;
  }

  const cleanType = phaseType.trim();

  try {
    // Check for duplicate phase type
    const existing = await db
      .select({ id: requiredImageDefinitionsTable.id })
      .from(requiredImageDefinitionsTable)
      .where(eq(requiredImageDefinitionsTable.phaseType, cleanType))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: `Phase template "${cleanType}" already exists. Use PUT to update.` });
      return;
    }

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(requiredImageDefinitionsTable)
        .values(
          slots.map((s, i) => ({
            phaseType: cleanType,
            reqImgType: s.reqImgType.trim(),
            reqImgOrder: s.reqImgOrder?.trim() || String(i + 1).padStart(2, "0"),
            description: s.description?.trim() || null,
            locationType,
          })),
        )
        .returning();
      return rows;
    });

    res.status(201).json({
      phaseType: cleanType,
      locationType,
      slots: inserted.map((r) => ({ reqImgType: r.reqImgType, reqImgOrder: r.reqImgOrder, description: r.description })),
      locationCount: 0,
      imageCount: inserted.length,
    });
  } catch (err) {
    logger.error({ err }, "phase-templates POST error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── PUT /api/phase-templates/:phaseType ─────────────────────────────────────
router.put("/phase-templates/:phaseType", requireAdmin, async (req, res): Promise<void> => {
  const { phaseType: rawPhaseType } = req.params;
  const phaseType = decodeURIComponent(rawPhaseType ?? "");
  const { locationType, slots, newPhaseType } = req.body as {
    locationType?: string;
    slots?: TemplateSlot[];
    newPhaseType?: string;
  };

  if (!phaseType) {
    res.status(400).json({ error: "phaseType param required" });
    return;
  }
  if (!locationType || !["TP", "OSP", "both"].includes(locationType)) {
    res.status(400).json({ error: "locationType must be TP, OSP, or both" });
    return;
  }
  if (!Array.isArray(slots) || slots.length === 0) {
    res.status(400).json({ error: "At least one image slot is required" });
    return;
  }

  const targetPhaseType = newPhaseType?.trim() || phaseType;

  try {
    const result = await db.transaction(async (tx) => {
      // Delete all existing slots for the old phase type
      await tx
        .delete(requiredImageDefinitionsTable)
        .where(eq(requiredImageDefinitionsTable.phaseType, phaseType));

      // Insert new slots (with potentially renamed phaseType)
      const rows = await tx
        .insert(requiredImageDefinitionsTable)
        .values(
          slots.map((s, i) => ({
            phaseType: targetPhaseType,
            reqImgType: s.reqImgType.trim(),
            reqImgOrder: s.reqImgOrder?.trim() || String(i + 1).padStart(2, "0"),
            description: s.description?.trim() || null,
            locationType,
          })),
        )
        .returning();

      // If renamed, update phases table references
      if (targetPhaseType !== phaseType) {
        await tx
          .update(phasesTable)
          .set({ phaseType: targetPhaseType, updatedAt: new Date() })
          .where(eq(phasesTable.phaseType, phaseType));
      }

      return rows;
    });

    // Get updated location count
    const [pc] = await db
      .select({ cnt: count(phasesTable.id) })
      .from(phasesTable)
      .where(eq(phasesTable.phaseType, targetPhaseType));

    res.json({
      phaseType: targetPhaseType,
      locationType,
      slots: result.map((r) => ({ reqImgType: r.reqImgType, reqImgOrder: r.reqImgOrder, description: r.description })),
      locationCount: Number(pc?.cnt ?? 0),
      imageCount: result.length,
    });
  } catch (err) {
    logger.error({ err }, "phase-templates PUT error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── DELETE /api/phase-templates/:phaseType ───────────────────────────────────
router.delete("/phase-templates/:phaseType", requireAdmin, async (req, res): Promise<void> => {
  const { phaseType: rawPhaseType } = req.params;
  const phaseType = decodeURIComponent(rawPhaseType ?? "");

  if (!phaseType) {
    res.status(400).json({ error: "phaseType param required" });
    return;
  }

  try {
    const deleted = await db
      .delete(requiredImageDefinitionsTable)
      .where(eq(requiredImageDefinitionsTable.phaseType, phaseType))
      .returning();

    if (deleted.length === 0) {
      res.status(404).json({ error: `No template found for phase type "${phaseType}"` });
      return;
    }

    res.json({ ok: true, phaseType, deletedSlots: deleted.length });
  } catch (err) {
    logger.error({ err }, "phase-templates DELETE error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
