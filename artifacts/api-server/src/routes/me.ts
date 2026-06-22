import { Router } from "express";
import { db } from "@workspace/db";
import {
  poolMembersTable,
  tournamentsTable,
  golferTiersTable,
  golfersTable,
  teamPicksTable,
  pickSubmissionsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { validateTieredPicks } from "../lib/tier-rules";

const router = Router();

async function memberByToken(token: string) {
  if (!token) return undefined;
  return db.select().from(poolMembersTable).where(eq(poolMembersTable.accessToken, token)).then((r) => r[0]);
}

async function activeTournament() {
  return db.select().from(tournamentsTable).where(eq(tournamentsTable.isActive, true)).then((r) => r[0]);
}

// GET /me/:token - everything the participant page needs for their own picks
router.get("/me/:token", async (req, res) => {
  try {
    const member = await memberByToken(req.params.token);
    if (!member) {
      res.status(404).json({ error: "Invalid link" });
      return;
    }
    const tournament = await activeTournament();
    if (!tournament) {
      res.json({ member: { id: member.id, name: member.name }, tournament: null });
      return;
    }
    const lockAt = tournament.picksLockAt;
    const locked = !!lockAt && Date.now() >= lockAt.getTime();

    const tiers = await db
      .select({ golferId: golferTiersTable.golferId, name: golfersTable.name, tier: golferTiersTable.tier, odds: golferTiersTable.odds })
      .from(golferTiersTable)
      .innerJoin(golfersTable, eq(golferTiersTable.golferId, golfersTable.id))
      .where(eq(golferTiersTable.tournamentId, tournament.id));

    const picks = await db
      .select({ golferId: teamPicksTable.golferId })
      .from(teamPicksTable)
      .where(and(eq(teamPicksTable.tournamentId, tournament.id), eq(teamPicksTable.poolMemberId, member.id)));

    const sub = await db
      .select({ id: pickSubmissionsTable.id })
      .from(pickSubmissionsTable)
      .where(and(eq(pickSubmissionsTable.tournamentId, tournament.id), eq(pickSubmissionsTable.poolMemberId, member.id)));

    res.json({
      member: { id: member.id, name: member.name },
      tournament: { id: tournament.id, name: tournament.name, year: tournament.year, picksLockAt: lockAt?.toISOString() ?? null, locked },
      tiersBuilt: tiers.length > 0,
      tiers,
      picks: picks.map((p) => p.golferId),
      submitted: sub.length > 0,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to load participant picks");
    res.status(500).json({ error: "Failed to load picks" });
  }
});

// POST /me/:token/picks - participant submits/updates their own picks
router.post("/me/:token/picks", async (req, res) => {
  try {
    const member = await memberByToken(req.params.token);
    if (!member) {
      res.status(404).json({ error: "Invalid link" });
      return;
    }
    const tournament = await activeTournament();
    if (!tournament) {
      res.status(400).json({ error: "No active tournament" });
      return;
    }
    if (tournament.picksLockAt && Date.now() >= tournament.picksLockAt.getTime()) {
      res.status(403).json({ error: "Picks are locked — contact the admin to make changes" });
      return;
    }

    const { golferIds } = req.body;
    if (!Array.isArray(golferIds)) {
      res.status(400).json({ error: "golferIds is required" });
      return;
    }

    const tiers = await db
      .select({ golferId: golferTiersTable.golferId, tier: golferTiersTable.tier })
      .from(golferTiersTable)
      .where(eq(golferTiersTable.tournamentId, tournament.id));
    if (tiers.length === 0) {
      res.status(400).json({ error: "Picks aren't open yet for this event" });
      return;
    }

    const v = validateTieredPicks(new Map(tiers.map((t) => [t.golferId, t.tier])), golferIds);
    if (!v.valid) {
      res.status(400).json({ error: v.reason });
      return;
    }

    await db.delete(teamPicksTable).where(and(eq(teamPicksTable.tournamentId, tournament.id), eq(teamPicksTable.poolMemberId, member.id)));
    for (const golferId of golferIds) {
      await db.insert(teamPicksTable).values({ tournamentId: tournament.id, poolMemberId: member.id, golferId });
    }
    await db
      .insert(pickSubmissionsTable)
      .values({ tournamentId: tournament.id, poolMemberId: member.id })
      .onConflictDoUpdate({
        target: [pickSubmissionsTable.tournamentId, pickSubmissionsTable.poolMemberId],
        set: { submittedAt: new Date() },
      });

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Failed to save participant picks");
    res.status(500).json({ error: "Failed to save picks" });
  }
});

export default router;
