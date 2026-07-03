import { Router } from "express";
import { db } from "@workspace/db";
import { tournamentsTable, teamPicksTable, golfersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { calculateScoreboard } from "../lib/scoring";
import { getHistoryCache, setHistoryCache } from "../lib/history-cache";

const router = Router();

// GET /history - aggregate analytics across all completed tournaments.
// Recomputing a full scoreboard per event costs 3-7s, so the result is cached
// and busted whenever an import/pick-edit/rename/delete touches the inputs.
router.get("/history", async (req, res) => {
  try {
    const cachedPayload = getHistoryCache();
    if (cachedPayload) {
      res.json(cachedPayload);
      return;
    }
    const all = await db.select().from(tournamentsTable);
    // Completed events, newest first (ESPN ids are incremental ~ chronological).
    const completed = all
      .filter((t) => t.status === "completed")
      .sort((a, b) => (Number(b.espnEventId) || 0) - (Number(a.espnEventId) || 0));

    type MStat = { played: number; wins: number; finishes: number[]; scores: number[] };
    const stat = new Map<string, MStat>();
    const events: { name: string; year: number; winners: string[]; winnerScore: number | null; field: number }[] = [];
    type Record_ = { member: string; event: string; toPar: number };
    let bestRound: Record_ | null = null;
    let worstRound: Record_ | null = null;

    for (const t of completed) {
      const lb = await calculateScoreboard(t.id);
      const players = lb.filter((e) => e.toPar !== null); // only members who entered picks
      if (players.length === 0) continue;
      const label = `${t.name} ${t.year}`;

      // Finish = the engine's rank (includes the best-single-golfer tie-break).
      const withFinish = players.map((e) => ({ ...e, finish: e.rank }));
      const winners = withFinish.filter((e) => e.finish === 1);
      const winnerScore = winners[0]?.toPar ?? null;
      events.push({ name: label, year: t.year, winners: winners.map((w) => w.name), winnerScore, field: players.length });

      for (const e of withFinish) {
        const toPar = e.toPar as number;
        const s = stat.get(e.name) ?? { played: 0, wins: 0, finishes: [], scores: [] };
        s.played++;
        s.finishes.push(e.finish);
        s.scores.push(toPar);
        if (e.finish === 1) s.wins++;
        stat.set(e.name, s);
        if (!bestRound || toPar < bestRound.toPar) bestRound = { member: e.name, event: label, toPar };
        if (!worstRound || toPar > worstRound.toPar) worstRound = { member: e.name, event: label, toPar };
      }
    }

    const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);
    const members = [...stat.entries()]
      .map(([name, s]) => ({
        name,
        played: s.played,
        wins: s.wins,
        winRate: s.played ? Math.round((s.wins / s.played) * 100) : 0,
        avgFinish: avg(s.finishes),
        bestFinish: s.finishes.length ? Math.min(...s.finishes) : null,
        avgScore: avg(s.scores),
        bestScore: s.scores.length ? Math.min(...s.scores) : null,
      }))
      .sort((a, b) => b.wins - a.wins || (a.avgFinish ?? 99) - (b.avgFinish ?? 99));

    // Most-picked golfers across completed events.
    const completedIds = new Set(completed.map((t) => t.id));
    const picks = await db
      .select({ name: golfersTable.name, tournamentId: teamPicksTable.tournamentId })
      .from(teamPicksTable)
      .innerJoin(golfersTable, eq(teamPicksTable.golferId, golfersTable.id));
    const golferCount = new Map<string, number>();
    for (const p of picks) if (completedIds.has(p.tournamentId)) golferCount.set(p.name, (golferCount.get(p.name) ?? 0) + 1);
    const topGolfers = [...golferCount.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);

    const payload = {
      totalEvents: events.length,
      years: [...new Set(completed.map((t) => t.year))].sort((a, b) => b - a),
      members,
      events,
      topGolfers,
      records: { bestRound, worstRound },
    };
    setHistoryCache(payload);
    res.json(payload);
  } catch (err) {
    req.log.error({ err }, "Failed to build history");
    res.status(500).json({ error: "Failed to build history" });
  }
});

export default router;
