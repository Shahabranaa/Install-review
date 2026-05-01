import { Router, type IRouter } from "express";
import { eq, and, type SQL } from "drizzle-orm";
import { db, decisionsTable } from "@workspace/db";
import {
  ListDecisionsQueryParams,
  ListDecisionsResponse,
} from "@workspace/api-zod";
import { serialize } from "../lib/serialize";

const router: IRouter = Router();

router.get("/decisions", async (req, res): Promise<void> => {
  const queryParams = ListDecisionsQueryParams.safeParse(req.query);
  let decisions;
  if (queryParams.success) {
    const { imageId, phaseId } = queryParams.data;
    const conditions: SQL[] = [];
    if (imageId) conditions.push(eq(decisionsTable.imageId, imageId));
    if (phaseId) conditions.push(eq(decisionsTable.phaseId, phaseId));
    decisions = conditions.length > 0
      ? await db.select().from(decisionsTable).where(and(...conditions))
      : await db.select().from(decisionsTable);
  } else {
    decisions = await db.select().from(decisionsTable);
  }
  res.json(ListDecisionsResponse.parse(serialize(decisions)));
});

export default router;
