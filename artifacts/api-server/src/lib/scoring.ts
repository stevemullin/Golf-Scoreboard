import { db } from "@workspace/db";
import {
  tournamentsTable,
  poolMembersTable,
  golfersTable,
  teamPicksTable,
  golferScoresTable,
  manualScoresTable,
  apiCacheTable,
} from "@workspace/db";
import { eq, and, isNotNull, desc } from "drizzle-orm";
import { fetchESPNScoreboard } from "./espn";
import { logger } from "./logger";

export interface GolferRoundDetail {
  golferId: string;
  golferName: string;
  scoreToPar: number | null;
  holesCompleted: number;
  isCut: boolean;
  isWd: boolean;
  isDq: boolean;
  isPenalty: boolean;
  teeTime: string | null;
  counted: boolean | null;
}

export interface RoundScore {
  roundNumber: number;
  score: number | null;
  golferDetails: GolferRoundDetail[];
}

export interface LeaderboardEntry {
  rank: number;
  poolMemberId: string;
  name: string;
  toPar: number | null;
  thru: string;
  today: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  rounds: RoundScore[];
}

function getMaxScoreForRound(
  allScores: Array<{ golferId: string; roundNumber: number; scoreToPar: number | null; holesCompleted: number; isCut: boolean; isWd: boolean; isDq: boolean }>,
  roundNumber: number
): number | null {
  const scores = allScores
    .filter(s => s.roundNumber === roundNumber && !s.isCut && !s.isWd && !s.isDq && s.scoreToPar !== null)
    .map(s => s.scoreToPar!);

  if (scores.length === 0) return null;
  return Math.max(...scores);
}

function calculateMemberRoundScore(
  picks: Array<{ golferId: string; golferName: string }>,
  allScores: Array<{ golferId: string; roundNumber: number; scoreToPar: number | null; holesCompleted: number; isCut: boolean; isWd: boolean; isDq: boolean; teeTime: string | null }>,
  roundNumber: number,
  maxScoreForRound: number | null
): { score: number | null; golferScores: GolferRoundDetail[] } {
  const golferScores: GolferRoundDetail[] = [];

  for (const pick of picks) {
    const gs = allScores.find(s => s.golferId === pick.golferId && s.roundNumber === roundNumber);

    let effectiveScore: number | null = null;
    let isPenalty = false;

    if (gs && gs.scoreToPar !== null) {
      effectiveScore = gs.scoreToPar;
    } else if (gs && (gs.isCut || gs.isWd || gs.isDq) && maxScoreForRound !== null) {
      effectiveScore = maxScoreForRound;
      isPenalty = true;
    }

    golferScores.push({
      golferId: pick.golferId,
      golferName: pick.golferName,
      scoreToPar: effectiveScore,
      holesCompleted: gs?.holesCompleted || 0,
      isCut: gs?.isCut || false,
      isWd: gs?.isWd || false,
      isDq: gs?.isDq || false,
      isPenalty,
      teeTime: gs?.teeTime || null,
      counted: null,
    });
  }

  // Sort ascending (best first).
  // Golfers not yet started (scoreToPar === null, not cut/WD/DQ) are treated as 0 (even par)
  // so they rank ahead of anyone who is over par. Penalty scores (cut/WD/DQ) are always
  // non-null by this point (set to maxScoreForRound above), so ?? 0 only affects
  // genuinely-not-started golfers.
  const sorted = [...golferScores].sort((a, b) => {
    const aEff = a.scoreToPar ?? 0;
    const bEff = b.scoreToPar ?? 0;
    return aEff - bEff;
  });

  if (sorted.length < 4) {
    const partialSum = sorted.reduce((sum, g) => sum + (g.scoreToPar ?? 0), 0);
    return { score: sorted.length > 0 ? partialSum : null, golferScores };
  }

  const best4 = sorted.slice(0, 4);
  const roundScore = best4.reduce((sum, g) => sum + (g.scoreToPar ?? 0), 0);

  const countedIds = new Set(best4.map(g => g.golferId));
  for (const g of golferScores) {
    g.counted = countedIds.has(g.golferId);
  }

  return { score: roundScore, golferScores };
}

function calculateMemberThru(
  rounds: RoundScore[],
  currentRound: number
): string {
  if (currentRound === 0) return "-";

  const currentRoundData = rounds.find(r => r.roundNumber === currentRound);
  if (!currentRoundData) return "-";

  const golfers = currentRoundData.golferDetails;

  const finished = golfers.filter(g => g.holesCompleted === 18 && !g.isCut);
  const inProgress = golfers.filter(g => g.holesCompleted > 0 && g.holesCompleted < 18 && !g.isCut);

  if (finished.length + golfers.filter(g => g.isCut).length === golfers.length) return "F";
  if (inProgress.length === 0 && finished.length === 0) return "-";
  if (inProgress.length > 0) {
    const minHoles = Math.min(...inProgress.map(g => g.holesCompleted));
    return minHoles.toString();
  }
  return "-";
}

export async function refreshFromESPN(tournamentId: string): Promise<void> {
  const tournament = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId)).then(r => r[0]);
  if (!tournament) return;

  const espnData = await fetchESPNScoreboard(tournament.espnEventId ?? undefined);
  if (!espnData) {
    logger.warn({ tournamentId }, "ESPN fetch returned null, serving stale data");
    return;
  }

  const { golfers, eventStatus } = espnData;

  // Upsert golfers and their scores
  for (const golferData of golfers) {
    // Upsert golfer
    const existing = await db.select().from(golfersTable).where(eq(golfersTable.espnId, golferData.espnId)).then(r => r[0]);

    let golferId: string;
    if (existing) {
      golferId = existing.id;
      await db.update(golfersTable).set({ name: golferData.name }).where(eq(golfersTable.id, golferId));
    } else {
      const inserted = await db.insert(golfersTable).values({ espnId: golferData.espnId, name: golferData.name }).returning();
      golferId = inserted[0].id;
    }

    // Upsert round scores
    for (const rs of golferData.scores) {
      const existingScore = await db.select().from(golferScoresTable)
        .where(and(
          eq(golferScoresTable.tournamentId, tournamentId),
          eq(golferScoresTable.golferId, golferId),
          eq(golferScoresTable.roundNumber, rs.roundNumber)
        )).then(r => r[0]);

      const scoreData = {
        tournamentId,
        golferId,
        roundNumber: rs.roundNumber,
        scoreToPar: rs.scoreToPar,
        holesCompleted: rs.holesCompleted,
        isCut: rs.isCut,
        isWd: rs.isWd,
        isDq: rs.isDq,
        teeTime: rs.teeTime,
      };

      if (existingScore) {
        await db.update(golferScoresTable).set(scoreData).where(eq(golferScoresTable.id, existingScore.id));
      } else {
        await db.insert(golferScoresTable).values(scoreData);
      }
    }
  }

  // Update tournament round and status
  let newStatus = tournament.status;
  if (eventStatus.state === "in") newStatus = "active";
  else if (eventStatus.state === "post" || eventStatus.completed) newStatus = "completed";

  await db.update(tournamentsTable).set({
    currentRound: eventStatus.currentRound || tournament.currentRound,
    status: newStatus,
  }).where(eq(tournamentsTable.id, tournamentId));

  // Update api_cache
  await db.update(apiCacheTable).set({ lastFetchedAt: new Date() }).where(eq(apiCacheTable.tournamentId, tournamentId));

  logger.info({ tournamentId, golferCount: golfers.length }, "ESPN refresh complete");
}

export async function getOrRefreshScoreboard(tournamentId: string): Promise<LeaderboardEntry[]> {
  // Check cache
  const cache = await db.select().from(apiCacheTable).where(eq(apiCacheTable.tournamentId, tournamentId)).then(r => r[0]);

  if (cache) {
    const now = new Date();
    const lastFetched = cache.lastFetchedAt;
    const shouldRefresh = !lastFetched ||
      (now.getTime() - lastFetched.getTime()) > cache.refreshIntervalMinutes * 60 * 1000;

    if (shouldRefresh) {
      try {
        await refreshFromESPN(tournamentId);
      } catch (err) {
        logger.error({ err }, "ESPN refresh failed, serving stale data");
      }
    }
  }

  return calculateScoreboard(tournamentId);
}

export async function calculateScoreboard(tournamentId: string): Promise<LeaderboardEntry[]> {
  const tournament = await db.select().from(tournamentsTable).where(eq(tournamentsTable.id, tournamentId)).then(r => r[0]);
  if (!tournament) return [];

  const members = await db.select().from(poolMembersTable).orderBy(poolMembersTable.name);

  // Get all scores for this tournament
  const allScores = await db.select({
    golferId: golferScoresTable.golferId,
    roundNumber: golferScoresTable.roundNumber,
    scoreToPar: golferScoresTable.scoreToPar,
    holesCompleted: golferScoresTable.holesCompleted,
    isCut: golferScoresTable.isCut,
    isWd: golferScoresTable.isWd,
    isDq: golferScoresTable.isDq,
    teeTime: golferScoresTable.teeTime,
  }).from(golferScoresTable).where(eq(golferScoresTable.tournamentId, tournamentId));

  // Get max score per round for cut penalties
  const maxScores: Record<number, number | null> = {};
  for (let r = 1; r <= 4; r++) {
    maxScores[r] = getMaxScoreForRound(allScores, r);
  }

  const entries: LeaderboardEntry[] = [];

  for (const member of members) {
    // Get this member's picks
    const picks = await db.select({
      golferId: teamPicksTable.golferId,
      golferName: golfersTable.name,
    })
      .from(teamPicksTable)
      .innerJoin(golfersTable, eq(teamPicksTable.golferId, golfersTable.id))
      .where(and(
        eq(teamPicksTable.tournamentId, tournamentId),
        eq(teamPicksTable.poolMemberId, member.id)
      ));

    const rounds: RoundScore[] = [];
    let totalToPar: number | null = null;
    let todayScore: number | null = null;

    for (let r = 1; r <= 4; r++) {
      const result = calculateMemberRoundScore(picks, allScores, r, maxScores[r]);
      rounds.push({
        roundNumber: r,
        score: result.score,
        golferDetails: result.golferScores,
      });

      if (result.score !== null) {
        totalToPar = (totalToPar || 0) + result.score;
      }

      if (r === tournament.currentRound) {
        todayScore = result.score;
      }
    }

    const thru = calculateMemberThru(rounds, tournament.currentRound);
    const roundScores = rounds.map(r => r.score);

    entries.push({
      rank: 0,
      poolMemberId: member.id,
      name: member.name,
      toPar: totalToPar,
      thru,
      today: todayScore,
      r1: roundScores[0] ?? null,
      r2: roundScores[1] ?? null,
      r3: roundScores[2] ?? null,
      r4: roundScores[3] ?? null,
      rounds,
    });
  }

  // Sort by toPar ascending, nulls last
  entries.sort((a, b) => {
    if (a.toPar === null && b.toPar === null) return 0;
    if (a.toPar === null) return 1;
    if (b.toPar === null) return -1;
    return a.toPar - b.toPar;
  });

  // Assign ranks (handle ties)
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i].toPar !== entries[i - 1].toPar) {
      rank = i + 1;
    }
    entries[i].rank = rank;
  }

  return entries;
}
