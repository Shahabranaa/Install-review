import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sitesTable } from "@workspace/db";
import {
  ListSitesQueryParams,
  ListSitesResponse,
  CreateSiteBody,
  GetSiteParams,
  GetSiteResponse,
  UpdateSiteParams,
  UpdateSiteBody,
  UpdateSiteResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/sites", async (req, res): Promise<void> => {
  const queryParams = ListSitesQueryParams.safeParse(req.query);
  let sites;
  if (queryParams.success && queryParams.data.projectId) {
    sites = await db.select().from(sitesTable).where(eq(sitesTable.projectId, queryParams.data.projectId));
  } else {
    sites = await db.select().from(sitesTable);
  }
  res.json(ListSitesResponse.parse(serialize(sites)));
});

router.post("/sites", async (req, res): Promise<void> => {
  const parsed = CreateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.insert(sitesTable).values(parsed.data).returning();
  res.status(201).json(GetSiteResponse.parse(serialize(site)));
});

router.get("/sites/:id", async (req, res): Promise<void> => {
  const params = GetSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [site] = await db.select().from(sitesTable).where(eq(sitesTable.id, params.data.id));
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(GetSiteResponse.parse(serialize(site)));
});

router.patch("/sites/:id", async (req, res): Promise<void> => {
  const params = UpdateSiteParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateSiteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [site] = await db.update(sitesTable).set({ ...parsed.data, updatedAt: new Date() }).where(eq(sitesTable.id, params.data.id)).returning();
  if (!site) {
    res.status(404).json({ error: "Site not found" });
    return;
  }
  res.json(UpdateSiteResponse.parse(serialize(site)));
});

export default router;
