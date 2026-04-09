import { Router } from "express";
import { db } from "@workspace/db";
import { poolMembersTable } from "@workspace/db";
import { asc } from "drizzle-orm";

const router = Router();

router.get("/pool-members", async (req, res) => {
  try {
    const members = await db.select().from(poolMembersTable).orderBy(asc(poolMembersTable.name));
    res.json(members.map(m => ({
      id: m.id,
      name: m.name,
      createdAt: m.createdAt.toISOString(),
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to get pool members");
    res.status(500).json({ error: "Failed to get pool members" });
  }
});

export default router;
