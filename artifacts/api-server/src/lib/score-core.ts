// Pure scoring engine — no DB, no network, no imports — so the pool's core
// rules (best-4-of-N, cut/WD/DQ penalties, ranking) are unit-testable. The
// thin DB wrapper lives in scoring.ts (calculateScoreboard).

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
  counted: boolean;
  holeScores: string | null;
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

export interface ScoreRow {
  golferId: string;
  roundNumber: number;
  scoreToPar: number | null;
  holesCompleted: number;
  isCut: boolean;
  isWd: boolean;
  isDq: boolean;
  teeTime: string | null;
  holeScores: string | null;
}

export interface PickRow {
  poolMemberId: string;
  golferId: string;
  golferName: string;
}

export interface MemberRow {
  id: string;
  name: string;
}

export interface LeaderboardInput {
  status: string; // tournament status ("upcoming" | "active" | "completed")
  currentRound: number; // tournament.currentRound || 1
  members: MemberRow[];
  allScores: ScoreRow[];
  allPicks: PickRow[];
}

export function getMaxScoreForRound(
  allScores: Array<{ golferId: string; roundNumber: number; scoreToPar: number | null; holesCompleted: number; isCut: boolean; isWd: boolean; isDq: boolean }>,
  roundNumber: number,
): number | null {
  const scores = allScores
    .filter(s => s.roundNumber === roundNumber && !s.isCut && !s.isWd && !s.isDq && s.scoreToPar !== null)
    .map(s => s.scoreToPar!);

  if (scores.length === 0) return null;
  return Math.max(...scores);
}

export function calculateMemberThru(
  rounds: RoundScore[],
  currentRound: number,
): string {
  if (currentRound === 0) return "-";

  const currentRoundData = rounds.find(r => r.roundNumber === currentRound);
  if (!currentRoundData) return "-";

  // Only look at counted golfers for thru calculation
  const counted = currentRoundData.golferDetails.filter(g => g.counted);
  if (counted.length === 0) return "-";

  const active = counted.filter(g => !g.isCut && !g.isWd && !g.isDq);
  if (active.length === 0) return "F";

  if (active.every(g => g.holesCompleted === 18)) return "F";
  if (active.every(g => g.holesCompleted === 0)) return "-";

  const totalHoles = active.reduce((sum, g) => sum + g.holesCompleted, 0);
  return String(Math.round(totalHoles / active.length));
}

// The full pool computation for one tournament. Mirrors what the scoreboard
// shows: per-member best-4 team totals, per-round display scores, penalties
// for cut/WD/DQ golfers, and tie-aware ranks.
export function buildLeaderboard(input: LeaderboardInput): LeaderboardEntry[] {
  const { status, members, allScores, allPicks } = input;
  const currentRound = input.currentRound || 1;

  // Max score per round for cut/WD/DQ penalties
  const maxScores: Record<number, number | null> = {};
  for (let r = 1; r <= 4; r++) {
    maxScores[r] = getMaxScoreForRound(allScores, r);
  }

  // Group picks by member for O(1) lookup
  const picksByMember = new Map<string, Array<{ golferId: string; golferName: string }>>();
  for (const pick of allPicks) {
    if (!picksByMember.has(pick.poolMemberId)) picksByMember.set(pick.poolMemberId, []);
    picksByMember.get(pick.poolMemberId)!.push({ golferId: pick.golferId, golferName: pick.golferName });
  }

  const entries: LeaderboardEntry[] = [];

  for (const member of members) {
    const picks = picksByMember.get(member.id) ?? [];

    if (picks.length === 0) {
      entries.push({
        rank: 0,
        poolMemberId: member.id,
        name: member.name,
        toPar: null,
        thru: "-",
        today: null,
        r1: null, r2: null, r3: null, r4: null,
        rounds: [],
      });
      continue;
    }

    // ── Step 1: compute per-golfer per-round scores and tournament total ──────
    interface GolferWithTotal {
      golferId: string;
      golferName: string;
      isCut: boolean;
      isWd: boolean;
      isDq: boolean;
      roundData: Array<{
        roundNumber: number;
        scoreToPar: number | null;  // displayed score (null = not started)
        effectiveScore: number;     // used in tournament total (0 for not-started)
        isPenalty: boolean;
        holesCompleted: number;
        teeTime: string | null;
        holeScores: string | null;
      }>;
      tournamentTotal: number;
      counted: boolean;
    }

    const golferList: GolferWithTotal[] = picks.map(pick => {
      // A golfer is genuinely cut/WD/DQ if any of their round rows say so. For a
      // *completed* event, also treat a golfer with fewer round rows than the
      // event played as cut — covers historical imports done before the parser
      // backfilled missing R3/R4 rows (so the missed-cut penalty still applies).
      const picksScores = allScores.filter(s => s.golferId === pick.golferId);
      const isCut = picksScores.some(s => s.isCut)
        || (status === "completed" && picksScores.length > 0 && picksScores.length < currentRound);
      const isWd  = picksScores.some(s => s.isWd);
      const isDq  = picksScores.some(s => s.isDq);

      let tournamentTotal = 0;
      const roundData = [];

      for (let r = 1; r <= 4; r++) {
        const gs = allScores.find(s => s.golferId === pick.golferId && s.roundNumber === r);

        let scoreToPar: number | null = null;
        let effectiveScore = 0;
        let isPenalty = false;

        if (gs) {
          if (gs.scoreToPar !== null) {
            // Has an actual (or partial) score
            scoreToPar = gs.scoreToPar;
            effectiveScore = gs.scoreToPar;
          } else if (gs.isCut || gs.isWd || gs.isDq) {
            // Missed cut / WD / DQ — apply penalty score for this round
            const penalty = maxScores[r] ?? 0;
            scoreToPar = penalty;
            effectiveScore = penalty;
            isPenalty = true;
          } else {
            // Row exists but no score yet (not teed off in this round).
            // Display as "-", count as 0 (even par) toward tournament total.
            scoreToPar = null;
            effectiveScore = 0;
          }

          // Only include rounds up through the current round in the total
          if (r <= currentRound) {
            tournamentTotal += effectiveScore;
          }
        } else if ((isCut || isWd || isDq) && r <= currentRound) {
          // No row for this round, but the golfer is out (e.g. R4 after missing
          // the cut — ESPN stops listing them). Apply the round penalty too, so
          // cut golfers are penalized for R4 just like R3.
          const penalty = maxScores[r] ?? 0;
          scoreToPar = penalty;
          effectiveScore = penalty;
          isPenalty = true;
          tournamentTotal += effectiveScore;
        }
        // else: future round not yet in ESPN data — leave as not-started (0).

        roundData.push({
          roundNumber: r,
          scoreToPar,
          effectiveScore,
          isPenalty,
          holesCompleted: gs?.holesCompleted ?? 0,
          teeTime: gs?.teeTime ?? null,
          holeScores: gs?.holeScores ?? null,
        });
      }

      return {
        golferId: pick.golferId,
        golferName: pick.golferName,
        isCut,
        isWd,
        isDq,
        roundData,
        tournamentTotal,
        counted: false,
      };
    });

    // ── Step 2: rank by tournament total, mark best 4 as counted ─────────────
    const sorted = [...golferList].sort((a, b) => a.tournamentTotal - b.tournamentTotal);
    const best4 = sorted.slice(0, Math.min(4, sorted.length));
    const countedIds = new Set(best4.map(g => g.golferId));
    for (const g of golferList) {
      g.counted = countedIds.has(g.golferId);
    }

    // ── Step 3: team score = sum of best-4 tournament totals ─────────────────
    const teamScore = best4.length > 0
      ? best4.reduce((sum, g) => sum + g.tournamentTotal, 0)
      : null;

    // ── Step 4: build round display data ─────────────────────────────────────
    // For each round, golferDetails carries the actual round score + counted flag.
    // The round-level score (r1/r2/…) = sum of counted golfers' round scores
    // (display only — the team total does NOT come from summing r1+r2+r3+r4).
    const rounds: RoundScore[] = [];

    for (let r = 1; r <= 4; r++) {
      const golferDetails: GolferRoundDetail[] = golferList.map(g => {
        const rd = g.roundData[r - 1];
        return {
          golferId: g.golferId,
          golferName: g.golferName,
          scoreToPar: rd.scoreToPar,
          holesCompleted: rd.holesCompleted,
          isCut: g.isCut,
          isWd: g.isWd,
          isDq: g.isDq,
          isPenalty: rd.isPenalty,
          teeTime: rd.teeTime,
          counted: g.counted,
          holeScores: rd.holeScores,
        };
      });

      // Round display score: sum of counted golfers' actual round scores
      const countedGolfers = golferDetails.filter(gd => gd.counted);
      const anyCountedHasData = countedGolfers.some(gd => gd.scoreToPar !== null || gd.isPenalty);
      const roundScore = anyCountedHasData
        ? countedGolfers.reduce((sum, gd) => sum + (gd.scoreToPar ?? 0), 0)
        : null;

      rounds.push({ roundNumber: r, score: roundScore, golferDetails });
    }

    const todayScore = rounds.find(r => r.roundNumber === currentRound)?.score ?? null;
    const thru = calculateMemberThru(rounds, currentRound);

    entries.push({
      rank: 0,
      poolMemberId: member.id,
      name: member.name,
      toPar: teamScore,
      thru,
      today: todayScore,
      r1: rounds[0]?.score ?? null,
      r2: rounds[1]?.score ?? null,
      r3: rounds[2]?.score ?? null,
      r4: rounds[3]?.score ?? null,
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

  // Assign ranks with tie handling
  let rank = 1;
  for (let i = 0; i < entries.length; i++) {
    if (i > 0 && entries[i]!.toPar !== entries[i - 1]!.toPar) {
      rank = i + 1;
    }
    entries[i]!.rank = rank;
  }

  return entries;
}
