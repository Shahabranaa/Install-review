/**
 * CVOW Seed Script (plain ESM, no TypeScript compilation required)
 * Run with: node seed-cvow.mjs
 */
import pg from "pg";
import { ReplitConnectors } from "@replit/connectors-sdk";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SHEET_ID = "1qcr0jZEH7pwBmUlr6XS7YK4sa-Kqk2zvXFpBTJ5velw";

async function getAccessToken() {
  const connectors = new ReplitConnectors();
  const connections = await connectors.listConnections("google-drive");
  if (!connections || connections.length === 0) {
    throw new Error("No Google Drive connections found");
  }
  const conn = connections[0];
  const token = conn.settings?.access_token;
  if (!token) {
    throw new Error("No access_token in Google Drive connection settings");
  }
  return token;
}

async function fetchSheet(accessToken, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${text}`);
  }
  const json = await res.json();
  return json.values ?? [];
}

async function query(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

async function main() {
  console.log("Fetching Google Sheets access token...");
  const accessToken = await getAccessToken();
  console.log("Access token obtained.");

  console.log("Fetching String sheet...");
  const stringRows = await fetchSheet(accessToken, "String!A:Z");
  console.log(`  Got ${stringRows.length} rows`);

  console.log("Fetching Location sheet...");
  const locationRows = await fetchSheet(accessToken, "Location!A:Z");
  console.log(`  Got ${locationRows.length} rows`);

  const stringHeaders = stringRows[0] ?? [];
  const locationHeaders = locationRows[0] ?? [];

  // String column indices
  const sNameIdx = stringHeaders.indexOf("String_Name");
  const sNumIdx = stringHeaders.indexOf("String Number");
  const sOspIdx = stringHeaders.indexOf("String_Starting_Location");
  const sStatusIdx = stringHeaders.indexOf("String_Progress_Status");

  const stringData = [];
  for (const row of stringRows.slice(1)) {
    const name = (row[sNameIdx] ?? "").trim();
    if (!name) continue;
    const numStr = (row[sNumIdx] ?? "").trim();
    const stringNumber = numStr ? parseInt(numStr) : null;
    const ospName = (row[sOspIdx] ?? "").trim();
    const status = (row[sStatusIdx] ?? "").trim();
    stringData.push({ name, stringNumber, ospName, status });
  }

  // Location column indices
  const lNameIdx = locationHeaders.indexOf("Name");
  const lLatLngIdx = locationHeaders.indexOf("Lat Long");
  const lStringIdx = locationHeaders.indexOf("String");
  const lOspIdx = locationHeaders.indexOf("Primary_Sub_Station");
  const lCountOnStringIdx = locationHeaders.indexOf("Location_Count_On_String");
  const lTypeIdx = locationHeaders.indexOf("Location_Type");
  const lConnectedToIdx = locationHeaders.indexOf("Location_Connected_To");
  const lStatusIdx = locationHeaders.indexOf("Location_Progress_Status");

  const locationData = [];
  for (const row of locationRows.slice(1)) {
    const name = (row[lNameIdx] ?? "").trim();
    if (!name) continue;
    const latLng = (row[lLatLngIdx] ?? "").trim();
    let lat = null, lng = null;
    if (latLng) {
      const parts = latLng.split(",").map((s) => s.trim());
      if (parts.length >= 2) {
        const la = parseFloat(parts[0]), lo = parseFloat(parts[1]);
        if (!isNaN(la) && !isNaN(lo)) { lat = la; lng = lo; }
      }
    }
    const stringName = (row[lStringIdx] ?? "").trim();
    const ospName = (row[lOspIdx] ?? "").trim();
    const countOnString = row[lCountOnStringIdx] ? parseInt(row[lCountOnStringIdx]) : null;
    const locationType = (row[lTypeIdx] ?? "").trim() || "Tower";
    const connectedTo = (row[lConnectedToIdx] ?? "").trim() || null;
    const progressStatus = (row[lStatusIdx] ?? "").trim();
    locationData.push({ name, lat, lng, stringName, ospName, countOnString, locationType, connectedTo, progressStatus });
  }

  const ospLocations = locationData.filter(
    (l) => l.locationType.toLowerCase() === "osp"
  );

  console.log(`Parsed ${stringData.length} strings, ${locationData.length} locations, ${ospLocations.length} OSPs`);

  // ─── CLEAR ALL DATA ────────────────────────────────────────────────────────
  console.log("\nClearing existing data...");
  await query("DELETE FROM documents");
  await query("DELETE FROM decisions");
  await query("DELETE FROM issues");
  await query("DELETE FROM images");
  await query("DELETE FROM phases");
  await query("DELETE FROM towers");
  await query("DELETE FROM strings");
  await query("DELETE FROM locations");
  await query("DELETE FROM sites");
  await query("DELETE FROM projects");
  console.log("Cleared.");

  // ─── INSERT PROJECT ─────────────────────────────────────────────────────────
  const [project] = await query(
    "INSERT INTO projects (name, description) VALUES ($1, $2) RETURNING id",
    ["CVOW", "Coastal Virginia Offshore Wind project"]
  );
  console.log(`Project inserted: id=${project.id}`);

  // ─── INSERT SITE ────────────────────────────────────────────────────────────
  const [site] = await query(
    "INSERT INTO sites (project_id, name, description) VALUES ($1, $2, $3) RETURNING id",
    [project.id, "CVOW Offshore Site", "Main offshore wind farm site"]
  );
  console.log(`Site inserted: id=${site.id}`);

  // ─── INSERT OSP LOCATIONS ───────────────────────────────────────────────────
  const ospIdMap = {};
  for (const osp of ospLocations) {
    const [loc] = await query(
      "INSERT INTO locations (site_id, name, type, notes) VALUES ($1, $2, $3, $4) RETURNING id",
      [site.id, osp.name, "OSP", "Offshore Substation Platform"]
    );
    ospIdMap[osp.name] = loc.id;
    console.log(`  OSP: ${osp.name} → id=${loc.id}`);
  }

  // ─── INSERT STRINGS ─────────────────────────────────────────────────────────
  console.log("\nInserting strings...");
  const stringIdMap = {};
  let skippedStrings = 0;
  for (const s of stringData) {
    const locationId = ospIdMap[s.ospName];
    if (!locationId) {
      skippedStrings++;
      console.warn(`  WARN: No OSP for string "${s.name}" (OSP: "${s.ospName}")`);
      continue;
    }
    const [str] = await query(
      "INSERT INTO strings (location_id, name, string_number, status) VALUES ($1, $2, $3, $4) RETURNING id",
      [locationId, s.name, s.stringNumber, s.status || "pending"]
    );
    stringIdMap[s.name] = str.id;
  }
  console.log(`  Inserted ${Object.keys(stringIdMap).length} strings (skipped ${skippedStrings})`);

  // ─── INSERT TOWERS ──────────────────────────────────────────────────────────
  console.log("\nInserting towers...");
  let towerCount = 0;
  let skippedTowers = 0;
  for (const loc of locationData) {
    if (loc.locationType.toLowerCase() === "osp") continue;
    if (!loc.stringName) { skippedTowers++; continue; }
    const stringId = stringIdMap[loc.stringName];
    if (!stringId) {
      skippedTowers++;
      continue;
    }
    await query(
      `INSERT INTO towers (string_id, name, lat, lng, progress_status, location_type, connected_to, count_on_string)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [stringId, loc.name, loc.lat, loc.lng, loc.progressStatus || "", loc.locationType || "Tower", loc.connectedTo, loc.countOnString]
    );
    towerCount++;
  }
  console.log(`  Inserted ${towerCount} towers (skipped ${skippedTowers})`);

  console.log("\nCVOW seed complete!");
  console.log(`Summary: 1 project, 1 site, ${ospLocations.length} OSPs, ${Object.keys(stringIdMap).length} strings, ${towerCount} towers`);
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  pool.end();
  process.exit(1);
});
