import { Router, type IRouter } from "express";
import { eq, and, isNotNull } from "drizzle-orm";
import {
  db,
  requiredImageDefinitionsTable,
  sheetPhotosTable,
  stringsTable,
  locationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/compliance", async (req, res): Promise<void> => {
  try {
    const { stringId, locationId, cableLink, locationLink, phaseType } = req.query as Record<string, string>;

    let resolvedCableLink: string | null = null;
    let resolvedLocationLink: string | null = null;

    if (cableLink) {
      resolvedCableLink = cableLink;
    } else if (stringId) {
      const id = parseInt(stringId);
      if (!isNaN(id)) {
        const [str] = await db.select().from(stringsTable).where(eq(stringsTable.id, id));
        if (str) resolvedCableLink = str.name;
      }
    }

    if (locationLink) {
      resolvedLocationLink = locationLink;
    }

    if (!resolvedCableLink && !resolvedLocationLink && !locationId) {
      res.status(400).json({ error: "Provide stringId, cableLink, locationId, or locationLink" });
      return;
    }

    const defs = await db.select().from(requiredImageDefinitionsTable)
      .where(phaseType ? eq(requiredImageDefinitionsTable.phaseType, phaseType) : undefined)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgOrder);

    let photoQuery = db.select().from(sheetPhotosTable)
      .$dynamic()
      .where(isNotNull(sheetPhotosTable.reqImgType));

    const conditions = [];
    if (resolvedCableLink) {
      conditions.push(eq(sheetPhotosTable.cableLink, resolvedCableLink));
    }
    if (resolvedLocationLink) {
      conditions.push(eq(sheetPhotosTable.locationLink, resolvedLocationLink));
    }
    if (phaseType) {
      conditions.push(eq(sheetPhotosTable.phaseLink, phaseType));
    }

    const photos = conditions.length > 0
      ? await db.select().from(sheetPhotosTable).where(and(isNotNull(sheetPhotosTable.reqImgType), ...conditions))
      : await db.select().from(sheetPhotosTable).where(isNotNull(sheetPhotosTable.reqImgType));

    const result = defs.map((def) => {
      const matching = photos.filter((p) => p.reqImgType === def.reqImgType && p.phaseLink === def.phaseType);
      return {
        reqImgType: def.reqImgType,
        reqImgOrder: def.reqImgOrder,
        phaseType: def.phaseType,
        status: matching.length > 0 ? "submitted" : "missing",
        photos: matching.map((p) => ({
          photoId: p.photoId,
          wasabiKey: p.wasabiKey,
          imageUrl: p.wasabiKey ? `https://cvow-photos.s3.us-east-1.wasabisys.com/${p.wasabiKey}` : null,
          imageAvailable: p.imageAvailable,
          locationLink: p.locationLink,
          approval: p.approval,
          cableLink: p.cableLink,
        })),
      };
    });

    const submitted = result.filter((r) => r.status === "submitted").length;
    res.json({
      summary: { total: result.length, submitted, missing: result.length - submitted },
      items: result,
    });
  } catch (err) {
    logger.error({ err }, "Compliance endpoint error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/compliance/cables", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({ cableLink: sheetPhotosTable.cableLink })
      .from(sheetPhotosTable)
      .where(isNotNull(sheetPhotosTable.cableLink))
      .orderBy(sheetPhotosTable.cableLink);
    res.json(rows.map((r) => r.cableLink).filter(Boolean));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/compliance/phase-types", async (req, res): Promise<void> => {
  try {
    const rows = await db
      .selectDistinct({ phaseType: requiredImageDefinitionsTable.phaseType })
      .from(requiredImageDefinitionsTable)
      .orderBy(requiredImageDefinitionsTable.phaseType);
    res.json(rows.map((r) => r.phaseType));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
