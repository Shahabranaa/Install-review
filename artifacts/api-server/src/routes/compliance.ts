import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { eq, and, isNotNull, inArray, or, sql } from "drizzle-orm";
import {
  db,
  requiredImageDefinitionsTable,
  sheetPhotosTable,
  stringsTable,
  locationsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function defLocationTypeFilter(locationType: string) {
  if (locationType === "TP" || locationType === "tower") {
    return or(
      eq(requiredImageDefinitionsTable.locationType, "TP"),
      eq(requiredImageDefinitionsTable.locationType, "both"),
    )!;
  }
  if (locationType === "OSP") {
    return or(
      eq(requiredImageDefinitionsTable.locationType, "OSP"),
      eq(requiredImageDefinitionsTable.locationType, "both"),
    )!;
  }
  if (locationType === "other") {
    return sql`1=0`;
  }
  // Empty string / no locationType = no filter (caller decides)
  return undefined;
}

router.get("/compliance", async (req, res): Promise<void> => {
  try {
    const { stringId, locationId, cableLink, locationLink, phaseType, locationType } = req.query as Record<string, string>;

    const cableLinkConditions: ReturnType<typeof eq>[] = [];

    if (cableLink) {
      cableLinkConditions.push(eq(sheetPhotosTable.cableLink, cableLink));
    } else if (stringId) {
      const id = parseInt(stringId);
      if (!isNaN(id)) {
        const [str] = await db.select().from(stringsTable).where(eq(stringsTable.id, id));
        if (str) cableLinkConditions.push(eq(sheetPhotosTable.cableLink, str.name));
      }
    } else if (locationId) {
      const locId = parseInt(locationId);
      if (!isNaN(locId)) {
        const strings = await db
          .select({ name: stringsTable.name })
          .from(stringsTable)
          .where(eq(stringsTable.locationId, locId));
        const names = strings.map((s) => s.name).filter(Boolean);
        if (names.length > 0) {
          cableLinkConditions.push(inArray(sheetPhotosTable.cableLink, names));
        }
      }
    }

    const locationLinkConditions: ReturnType<typeof eq>[] = [];
    if (locationLink) {
      locationLinkConditions.push(eq(sheetPhotosTable.locationLink, locationLink));
    }

    const hasFilter = cableLinkConditions.length > 0 || locationLinkConditions.length > 0;
    if (!hasFilter) {
      res.status(400).json({ error: "Provide stringId, cableLink, locationId, or locationLink" });
      return;
    }

    const defConditions = [];
    if (phaseType) defConditions.push(eq(requiredImageDefinitionsTable.phaseType, phaseType));
    const ltFilter = defLocationTypeFilter(locationType ?? "");
    if (ltFilter) defConditions.push(ltFilter);

    const defs = await db
      .select()
      .from(requiredImageDefinitionsTable)
      .where(defConditions.length > 0 ? and(...defConditions) : undefined)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgOrder);

    const photoConditions = [isNotNull(sheetPhotosTable.reqImgType)];
    if (cableLinkConditions.length > 0) photoConditions.push(...cableLinkConditions);
    if (locationLinkConditions.length > 0) photoConditions.push(...locationLinkConditions);
    if (phaseType) photoConditions.push(eq(sheetPhotosTable.phaseLink, phaseType));

    const photos = await db
      .select()
      .from(sheetPhotosTable)
      .where(and(...photoConditions));

    const result = defs.map((def) => {
      const matching = photos.filter(
        (p) => p.reqImgType === def.reqImgType && p.phaseLink === def.phaseType,
      );
      return {
        reqImgType: def.reqImgType,
        reqImgOrder: def.reqImgOrder,
        phaseType: def.phaseType,
        locationType: def.locationType,
        status: matching.length > 0 ? "submitted" : "missing",
        photos: matching.map((p) => ({
          photoId: p.photoId,
          wasabiKey: p.wasabiKey,
          imageUrl: p.wasabiKey
            ? `https://cvow-photos.s3.us-east-1.wasabisys.com/${p.wasabiKey}`
            : null,
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

router.get("/compliance/cables", async (_req, res): Promise<void> => {
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
    const { locationType } = req.query as Record<string, string>;
    const ltFilter = defLocationTypeFilter(locationType ?? "");
    const rows = await db
      .selectDistinct({ phaseType: requiredImageDefinitionsTable.phaseType })
      .from(requiredImageDefinitionsTable)
      .where(ltFilter)
      .orderBy(requiredImageDefinitionsTable.phaseType);
    res.json(rows.map((r) => r.phaseType));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/compliance/phase-defs", async (req, res): Promise<void> => {
  try {
    const { locationType, locationId } = req.query as Record<string, string>;

    let resolvedLocationType = locationType;

    if (!resolvedLocationType && locationId) {
      const locId = parseInt(locationId);
      if (!isNaN(locId)) {
        const [loc] = await db.select({ type: locationsTable.type }).from(locationsTable).where(eq(locationsTable.id, locId));
        if (loc) resolvedLocationType = loc.type;
      }
    }

    if (resolvedLocationType === "other") {
      res.json([]);
      return;
    }

    const ltFilter = defLocationTypeFilter(resolvedLocationType ?? "");
    const defs = await db
      .select()
      .from(requiredImageDefinitionsTable)
      .where(ltFilter)
      .orderBy(requiredImageDefinitionsTable.phaseType, requiredImageDefinitionsTable.reqImgOrder, requiredImageDefinitionsTable.reqImgType);

    const grouped: Record<string, { phaseType: string; locationType: string; items: { reqImgType: string; reqImgOrder: string | null; description: string | null }[] }> = {};
    for (const def of defs) {
      if (!grouped[def.phaseType]) {
        grouped[def.phaseType] = { phaseType: def.phaseType, locationType: def.locationType, items: [] };
      }
      grouped[def.phaseType]!.items.push({
        reqImgType: def.reqImgType,
        reqImgOrder: def.reqImgOrder,
        description: def.description,
      });
    }

    res.json(Object.values(grouped));
  } catch (err) {
    logger.error({ err }, "phase-defs endpoint error");
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
