import { Router, type IRouter } from "express";
import { eq, isNotNull } from "drizzle-orm";
import { db, towersTable } from "@workspace/db";
import { sheetsRequest, isSheetsConfigured, SPREADSHEET_ID } from "../lib/google-sheets";

const router: IRouter = Router();

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CableRow {
  cableName: string;
  tower: string;
  string: string;
}

// ─── In-memory enrichment cache (cableName → string) ─────────────────────────
// Populated by sync; used only to enrich the `string` field in GET.

const stringByTower = new Map<string, string>();

// ─── Sheet helpers ────────────────────────────────────────────────────────────

async function fetchCableSheet(): Promise<CableRow[]> {
  const response = await sheetsRequest(`/${SPREADSHEET_ID}/values/Cable!A:Z`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cable sheet fetch failed (${response.status}): ${text}`);
  }
  const data = await response.json() as { values?: string[][] };
  const rows = data.values ?? [];
  if (rows.length === 0) return [];

  const headers = rows[0];
  const idx = (name: string) => headers.indexOf(name);
  const get = (row: string[], i: number) => (row[i] ?? "").trim();

  const cableNameIdx  = idx("Cable Name");
  const locationBIdx  = idx("Location_B");
  const stringLinkIdx = idx("Cable_String_Link");

  return rows.slice(1)
    .map(row => ({
      cableName: get(row, cableNameIdx),
      tower:     get(row, locationBIdx),
      string:    get(row, stringLinkIdx),
    }))
    .filter(r =>
      r.cableName &&
      r.tower &&
      // Skip OSP endpoints (T1/T2/T3) and onshore rows (_)
      !/^T[123]|^_/.test(r.tower)
    );
}

// ─── Sync function (exported for startup use) ─────────────────────────────────

export async function syncCablesFromSheet(): Promise<number> {
  if (!isSheetsConfigured()) return 0;
  const cables = await fetchCableSheet();

  // Build a lookup from tower → string for enrichment after confirmed DB match
  const sheetStringByTower = new Map<string, string>(
    cables.map(c => [c.tower, c.string])
  );

  let updated = 0;
  for (const { cableName, tower } of cables) {
    const result = await db
      .update(towersTable)
      .set({ connectedTo: cableName })
      .where(eq(towersTable.name, tower));
    const count = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) {
      // Only cache enrichment for rows that actually matched a DB tower
      stringByTower.set(tower, sheetStringByTower.get(tower) ?? "");
    }
    updated += count;
  }
  console.log(`[cables] Synced ${updated} tower cable IDs from sheet`);
  return updated;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/cables — list cable→tower mappings; DB is source of truth.
// The `string` field is enriched from the in-memory sheet cache when available.
router.get("/cables", async (req, res): Promise<void> => {
  try {
    const towers = await db
      .select({ name: towersTable.name, connectedTo: towersTable.connectedTo })
      .from(towersTable)
      .where(isNotNull(towersTable.connectedTo))
      .orderBy(towersTable.name);

    const cables: CableRow[] = towers.map(t => ({
      cableName: t.connectedTo!,
      tower:     t.name,
      string:    stringByTower.get(t.name) ?? "",
    }));

    res.json({ cables });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/cables/sync — read Cable sheet and update towers.connected_to
router.post("/cables/sync", async (req, res): Promise<void> => {
  if (!isSheetsConfigured()) {
    res.status(503).json({ error: "Google Sheets not configured" });
    return;
  }
  try {
    const updated = await syncCablesFromSheet();
    res.json({ updated });
  } catch (err: unknown) {
    console.error("Cable sync error:", err);
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
