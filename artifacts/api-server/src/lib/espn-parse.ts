// Pure ESPN event parsing — no fetch, no logging, no imports — so the round /
// cut / hole-score extraction rules are unit-testable. Fetching lives in espn.ts.

export interface ESPNRoundScore {
  roundNumber: number;
  scoreToPar: number | null;
  holesCompleted: number;
  isCut: boolean;
  isWd: boolean;
  isDq: boolean;
  teeTime: string | null;
  holeScores: string | null; // JSON: [{s:strokes,p:toPar}, ...up to 18]
}

export interface ESPNGolferData {
  espnId: string;
  name: string;
  flag: string | null; // country flag image URL from ESPN
  scores: ESPNRoundScore[];
  currentRound: number;
}

export interface ESPNEventStatus {
  state: string; // "pre", "in", "post"
  completed: boolean;
  currentRound: number;
  startDate: string | null;
  endDate: string | null;
  broadcasts: string[];
  statusDetail: string | null; // e.g. "Final", "In Progress - Round 3"
}

function parseScoreValue(displayValue: string): number | null {
  if (!displayValue || displayValue === "-" || displayValue === "") return null;
  if (displayValue === "E") return 0;
  return parseInt(displayValue, 10);
}

// Parse a single ESPN event object into golfers + status. Shared by the live
// (?event=) and historical (?dates=) fetch paths so scoring is identical.
export function parseEvent(event: any): { golfers: ESPNGolferData[]; eventStatus: ESPNEventStatus } | null {
  const competition = event.competitions?.[0];
  if (!competition) return null;

  // Determine current round from competitors' linescores
  let maxRound = 0;
  for (const comp of (competition.competitors || [])) {
    for (const ls of (comp.linescores || [])) {
      if (ls.period <= 4 && ls.linescores?.some((h: { displayValue: string }) => h.displayValue !== "-" && h.displayValue !== "")) {
        if (ls.period > maxRound) maxRound = ls.period;
      }
    }
  }

  const eventStatus: ESPNEventStatus = {
    state: event.status?.type?.state || "pre",
    completed: event.status?.type?.completed || false,
    currentRound: maxRound,
    startDate: event.date || null,
    endDate: event.endDate || null,
    broadcasts: Array.from(
      new Set(((competition.broadcasts || []) as Array<{ names?: string[] }>).flatMap((b) => b.names || [])),
    ),
    statusDetail: event.status?.type?.shortDetail || event.status?.type?.description || null,
  };

  const golfers: ESPNGolferData[] = [];

  for (const competitor of (competition.competitors || [])) {
    const espnId = competitor.id;
    const name = competitor.athlete?.displayName || competitor.athlete?.fullName || "Unknown";
    const flag = competitor.athlete?.flag?.href ?? null;
    const scores: ESPNRoundScore[] = [];

    // Determine cut/out status at the golfer level. Once the field reaches
    // round 3+, ESPN stops advancing cut players, so their highest linescore
    // period stays below the field's current round. A player who simply hasn't
    // teed off in the current round still gets a linescore entry for it, so they
    // are NOT flagged. (The old per-round "empty round > 2 = cut" rule wrongly
    // flagged everyone who hadn't started round 3/4 yet.)
    const golferPeriods = (competitor.linescores || [])
      .map((l: { period: number }) => l.period)
      .filter((p: number) => p >= 1 && p <= 4);
    const golferMaxPeriod = golferPeriods.length ? Math.max(...golferPeriods) : 0;
    const golferIsCut = maxRound >= 3 && golferMaxPeriod < maxRound;

    for (const linescore of (competitor.linescores || [])) {
      const roundNumber = linescore.period;
      if (roundNumber > 4) continue;

      const hasDisplayValue = Object.prototype.hasOwnProperty.call(linescore, "displayValue")
        && linescore.displayValue != null
        && linescore.displayValue !== "";

      if (!hasDisplayValue) {
        scores.push({ roundNumber, scoreToPar: null, holesCompleted: 0, isCut: golferIsCut, isWd: false, isDq: false, teeTime: null, holeScores: null });
        continue;
      }

      const displayValue = linescore.displayValue as string;
      const holes = linescore.linescores || [];
      const holesCompleted = holes.filter(
        (h: { displayValue: string }) => h.displayValue !== "-" && h.displayValue !== ""
      ).length;
      const holeScores = holes.length
        ? JSON.stringify(
            holes.slice(0, 18).map((h: { displayValue?: string; scoreType?: { displayValue?: string } }) => ({
              s: h.displayValue && h.displayValue !== "-" && h.displayValue !== "" ? h.displayValue : null,
              p: h.scoreType?.displayValue ?? null,
            })),
          )
        : null;

      const scoreToPar = parseScoreValue(displayValue);
      const isCut = golferIsCut && holesCompleted === 0 && scoreToPar === null;

      let teeTime: string | null = null;
      const stats = linescore.statistics?.categories?.[0]?.stats;
      if (stats && stats.length > 0) {
        const lastStat = stats[stats.length - 1];
        if (lastStat?.displayValue && lastStat.displayValue.includes(":")) {
          teeTime = lastStat.displayValue;
        }
      }

      scores.push({
        roundNumber,
        scoreToPar: isCut ? null : scoreToPar,
        holesCompleted,
        isCut,
        isWd: false,
        isDq: false,
        teeTime,
        holeScores,
      });
    }

    // Completed events drop a cut player's R3/R4 rows entirely. Backfill them as
    // isCut rows so the scorer applies the missed-cut penalty instead of a free 0.
    if (golferIsCut) {
      for (let r = 1; r <= maxRound; r++) {
        if (!scores.some((s) => s.roundNumber === r)) {
          scores.push({ roundNumber: r, scoreToPar: null, holesCompleted: 0, isCut: true, isWd: false, isDq: false, teeTime: null, holeScores: null });
        }
      }
    }

    golfers.push({ espnId, name, flag, scores, currentRound: maxRound });
  }

  return { golfers, eventStatus };
}

