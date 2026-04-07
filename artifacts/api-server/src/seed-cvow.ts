/**
 * CVOW Seed Script
 * Seeds the database with CVOW project data from Google Sheets.
 *
 * Usage: pnpm --filter @workspace/api-server run seed:cvow
 */
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  db,
  projectsTable,
  sitesTable,
  locationsTable,
  stringsTable,
  towersTable,
  phasesTable,
  imagesTable,
  issuesTable,
  decisionsTable,
  documentsTable,
} from "@workspace/db";

const SHEET_ID = "1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw";

async function getAccessToken(): Promise<string> {
  // Fallback 1: explicit env var (useful for CI / standalone runs)
  if (process.env.GOOGLE_DRIVE_ACCESS_TOKEN) {
    return process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  }

  // Fallback 2: Replit connectors SDK (works when running inside Replit server context)
  try {
    const connectors = new ReplitConnectors();
    const connections = await connectors.listConnections("google-drive");
    if (connections && connections.length > 0) {
      const conn = connections[0] as { settings?: { access_token?: string } };
      const token = conn.settings?.access_token;
      if (token) return token;
    }
  } catch {
    // SDK not available in this environment
  }

  throw new Error(
    "No Google Drive access token available. " +
    "Set GOOGLE_DRIVE_ACCESS_TOKEN env var or run inside the Replit environment."
  );
}

async function fetchSheet(
  accessToken: string,
  range: string,
): Promise<string[][]> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as { values?: string[][] };
  return json.values ?? [];
}

function parseLatLng(latLngStr: string): { lat: number | null; lng: number | null } {
  if (!latLngStr || !latLngStr.trim()) return { lat: null, lng: null };
  const parts = latLngStr.split(",").map((s) => s.trim());
  if (parts.length >= 2) {
    const lat = parseFloat(parts[0]);
    const lng = parseFloat(parts[1]);
    if (!isNaN(lat) && !isNaN(lng)) return { lat, lng };
  }
  return { lat: null, lng: null };
}

async function main() {
  console.log("Fetching Google Sheets access token...");
  const accessToken = await getAccessToken();
  console.log("Access token obtained.");

  console.log("Fetching String sheet...");
  const stringRows = await fetchSheet(accessToken, "String!A:Z");
  console.log(`  Got ${stringRows.length} rows from String sheet`);

  console.log("Fetching Location sheet...");
  const locationRows = await fetchSheet(accessToken, "Location!A:Z");
  console.log(`  Got ${locationRows.length} rows from Location sheet`);

  // Parse headers
  const stringHeaders = stringRows[0] ?? [];
  const locationHeaders = locationRows[0] ?? [];

  console.log("String sheet headers:", stringHeaders);
  console.log("Location sheet headers:", locationHeaders);

  // Find column indices for String sheet
  const sColIdx = (name: string) =>
    stringHeaders.findIndex(
      (h) => h && h.trim().toLowerCase() === name.toLowerCase(),
    );
  const sNameIdx = Math.max(sColIdx("String_Name"), sColIdx("String Name"));
  const sNumIdx = Math.max(sColIdx("String Number"), sColIdx("String_Number"));
  const sOspIdx = Math.max(
    sColIdx("String_Starting_Location"),
    sColIdx("String Starting Location"),
    sColIdx("Primary_Sub_Station"),
  );
  const sStatusIdx = Math.max(
    sColIdx("String_Progress_Status"),
    sColIdx("String Progress Status"),
    sColIdx("Status"),
  );

  console.log(`String cols → name:${sNameIdx}, num:${sNumIdx}, osp:${sOspIdx}, status:${sStatusIdx}`);

  // Find column indices for Location sheet
  const lColIdx = (name: string) =>
    locationHeaders.findIndex(
      (h) => h && h.trim().toLowerCase() === name.toLowerCase(),
    );
  const lNameIdx = Math.max(lColIdx("Name"), 0);
  const lLatLngIdx = Math.max(lColIdx("Lat Long"), lColIdx("LatLong"), lColIdx("Lat_Long"));
  const lStringIdx = Math.max(lColIdx("String"), lColIdx("String_Name"));
  const lOspIdx = Math.max(lColIdx("Primary_Sub_Station"), lColIdx("Primary Sub Station"), lColIdx("OSP"));
  const lTypeIdx = Math.max(lColIdx("Location_Type"), lColIdx("Location Type"), lColIdx("Type"));
  const lStatusIdx = Math.max(lColIdx("Location_Progress_Status"), lColIdx("Location Progress Status"), lColIdx("Status"));

  console.log(`Location cols → name:${lNameIdx}, latLng:${lLatLngIdx}, string:${lStringIdx}, osp:${lOspIdx}, type:${lTypeIdx}, status:${lStatusIdx}`);

  // Parse string data (skip header row)
  interface StringData {
    name: string;
    stringNumber: number | null;
    ospName: string;
    status: string;
  }
  const stringData: StringData[] = [];
  for (const row of stringRows.slice(1)) {
    const name =
      sNameIdx >= 0 ? (row[sNameIdx] ?? "").trim() : "";
    if (!name) continue;
    const numStr = sNumIdx >= 0 ? (row[sNumIdx] ?? "").trim() : "";
    const stringNumber = numStr ? parseInt(numStr) : null;
    const ospName = sOspIdx >= 0 ? (row[sOspIdx] ?? "").trim() : "";
    const status = sStatusIdx >= 0 ? (row[sStatusIdx] ?? "").trim() : "";
    stringData.push({ name, stringNumber, ospName, status });
  }
  console.log(`Parsed ${stringData.length} strings`);

  // Parse location data (skip header row)
  interface LocationData {
    name: string;
    lat: number | null;
    lng: number | null;
    stringName: string;
    ospName: string;
    locationType: string;
    progressStatus: string;
  }
  const locationData: LocationData[] = [];
  for (const row of locationRows.slice(1)) {
    const name = (row[lNameIdx] ?? "").trim();
    if (!name) continue;
    const latLng = lLatLngIdx >= 0 ? (row[lLatLngIdx] ?? "").trim() : "";
    const { lat, lng } = parseLatLng(latLng);
    const stringName = lStringIdx >= 0 ? (row[lStringIdx] ?? "").trim() : "";
    const ospName = lOspIdx >= 0 ? (row[lOspIdx] ?? "").trim() : "";
    const locationType = lTypeIdx >= 0 ? (row[lTypeIdx] ?? "").trim() : "Tower";
    const progressStatus = lStatusIdx >= 0 ? (row[lStatusIdx] ?? "").trim() : "";
    locationData.push({ name, lat, lng, stringName, ospName, locationType, progressStatus });
  }
  console.log(`Parsed ${locationData.length} tower/OSP locations`);

  // Derive unique OSPs
  const ospNames = Array.from(
    new Set([
      ...stringData.map((s) => s.ospName).filter(Boolean),
      ...locationData
        .filter((l) => l.locationType.toLowerCase().includes("osp") || l.locationType.toLowerCase().includes("substation"))
        .map((l) => l.name),
    ]),
  ).filter(Boolean);

  // Also derive from location type containing "OSP"
  const ospLocations = locationData.filter(
    (l) =>
      l.locationType.toLowerCase().includes("osp") ||
      l.locationType.toLowerCase().includes("substation") ||
      l.locationType.toLowerCase().includes("sub-station"),
  );

  const finalOspNames = Array.from(
    new Set([
      ...ospLocations.map((l) => l.name),
      ...stringData.map((s) => s.ospName).filter(Boolean),
    ]),
  ).filter(Boolean);

  console.log(`Found OSPs: ${finalOspNames.join(", ")}`);

  // ─── CLEAR ALL DATA ────────────────────────────────────────────────────────
  console.log("\nClearing existing data...");
  await db.delete(documentsTable);
  await db.delete(decisionsTable);
  await db.delete(issuesTable);
  await db.delete(imagesTable);
  await db.delete(phasesTable);
  await db.delete(towersTable);
  await db.delete(stringsTable);
  await db.delete(locationsTable);
  await db.delete(sitesTable);
  await db.delete(projectsTable);
  console.log("All existing data cleared.");

  // ─── INSERT PROJECT ─────────────────────────────────────────────────────────
  console.log("\nInserting CVOW project...");
  const [project] = await db
    .insert(projectsTable)
    .values({ name: "CVOW", description: "Coastal Virginia Offshore Wind project" })
    .returning();
  console.log(`  Project inserted: id=${project.id}`);

  // ─── INSERT SITE ────────────────────────────────────────────────────────────
  const [site] = await db
    .insert(sitesTable)
    .values({ projectId: project.id, name: "CVOW", address: null })
    .returning();
  console.log(`  Site inserted: id=${site.id}`);

  // ─── INSERT OSP LOCATIONS ───────────────────────────────────────────────────
  console.log("\nInserting OSP locations...");
  const ospIdMap: Record<string, number> = {};

  for (const ospName of finalOspNames) {
    const ospLoc = ospLocations.find((l) => l.name === ospName);
    const [loc] = await db
      .insert(locationsTable)
      .values({
        siteId: site.id,
        name: ospName,
        type: "OSP",
        notes: ospLoc ? `Lat: ${ospLoc.lat}, Lng: ${ospLoc.lng}` : null,
      })
      .returning();
    ospIdMap[ospName] = loc.id;
    console.log(`  OSP: ${ospName} → id=${loc.id}`);
  }

  // If no OSPs found from location data, use the unique OSP names from string data
  if (Object.keys(ospIdMap).length === 0) {
    const uniqueOsps = Array.from(new Set(stringData.map((s) => s.ospName).filter(Boolean)));
    for (const ospName of uniqueOsps) {
      const [loc] = await db
        .insert(locationsTable)
        .values({ siteId: site.id, name: ospName, type: "OSP", notes: null })
        .returning();
      ospIdMap[ospName] = loc.id;
      console.log(`  OSP (from strings): ${ospName} → id=${loc.id}`);
    }
  }

  // ─── INSERT STRINGS ─────────────────────────────────────────────────────────
  console.log("\nInserting strings...");
  const stringIdMap: Record<string, number> = {};

  for (const s of stringData) {
    const locationId = ospIdMap[s.ospName];
    if (!locationId) {
      console.warn(`  WARN: No OSP location found for string "${s.name}" (OSP: "${s.ospName}") — skipping`);
      continue;
    }
    const [str] = await db
      .insert(stringsTable)
      .values({
        locationId,
        name: s.name,
        stringNumber: s.stringNumber ?? null,
        status: s.status || "pending",
      })
      .returning();
    stringIdMap[s.name] = str.id;
  }
  console.log(`  Inserted ${Object.keys(stringIdMap).length} strings`);

  // ─── INSERT TOWERS ──────────────────────────────────────────────────────────
  console.log("\nInserting towers...");
  let towerCount = 0;
  let skippedTowers = 0;

  for (const loc of locationData) {
    // Skip OSP-type locations (already inserted)
    if (
      loc.locationType.toLowerCase().includes("osp") ||
      loc.locationType.toLowerCase().includes("substation") ||
      loc.locationType.toLowerCase().includes("sub-station")
    ) {
      continue;
    }

    const stringId = loc.stringName ? stringIdMap[loc.stringName] : undefined;
    if (!stringId) {
      skippedTowers++;
      if (skippedTowers <= 5) {
        console.warn(
          `  WARN: No string found for tower "${loc.name}" (string: "${loc.stringName}") — skipping`,
        );
      }
      continue;
    }

    await db.insert(towersTable).values({
      stringId,
      name: loc.name,
      lat: loc.lat ?? null,
      lng: loc.lng ?? null,
      progressStatus: loc.progressStatus || "",
      locationType: loc.locationType || "Tower",
      connectedTo: null,
      countOnString: null,
    });
    towerCount++;
  }
  console.log(`  Inserted ${towerCount} towers (skipped ${skippedTowers})`);

  console.log("\nCVOW seed complete!");
  console.log(
    `Summary: 1 project, 1 site, ${Object.keys(ospIdMap).length} OSPs, ${Object.keys(stringIdMap).length} strings, ${towerCount} towers`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
