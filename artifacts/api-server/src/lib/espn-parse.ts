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

  // ── Cut detection ──────────────────────────────────────────────────────────
  // ESPN gives NO explicit cut marker, and on live weekend mornings a cut
  // player and a made-the-cut-but-not-yet-teed player are byte-identical
  // (period-3 linescore, displayValue "-", zero holes, empty stats). The one
  // reliable inference: R3 tees go worst-score-first, so the CUT LINE is the
  // worst 36-hole total among players who have actual R3/R4 data — anyone with
  // no weekend data whose 36-hole total is strictly ABOVE that line missed the
  // cut (ties at the line make the cut in golf, hence strictly-above).
  const dataInfo = (ls: any) => {
    const holes = (ls.linescores || []).filter((h: any) => h.displayValue !== "-" && h.displayValue !== "").length;
    const score = typeof ls.displayValue === "string" ? parseScoreValue(ls.displayValue) : null;
    return { period: ls.period as number, score, hasData: score !== null || holes > 0 };
  };
  const perComp = (competition.competitors || []).map((competitor: any) => {
    const infos = (competitor.linescores || []).map(dataInfo).filter((i: any) => i.period >= 1 && i.period <= 4);
    const maxDataPeriod = infos.filter((i: any) => i.hasData).reduce((m: number, i: any) => Math.max(m, i.period), 0);
    const r1 = infos.find((i: any) => i.period === 1)?.score ?? null;
    const r2 = infos.find((i: any) => i.period === 2)?.score ?? null;
    const r12Total = r1 !== null && r2 !== null ? r1 + r2 : null;
    return { competitor, maxDataPeriod, r12Total };
  });
  let cutLine: number | null = null;
  if (maxRound >= 3) {
    const weekendTotals = perComp
      .filter((c: any) => c.maxDataPeriod >= 3 && c.r12Total !== null)
      .map((c: any) => c.r12Total as number);
    cutLine = weekendTotals.length ? Math.max(...weekendTotals) : null;
  }

  const golfers: ESPNGolferData[] = [];

  for (const { competitor, maxDataPeriod, r12Total } of perComp) {
    const espnId = competitor.id;
    const name = competitor.athlete?.displayName || competitor.athlete?.fullName || "Unknown";
    const flag = competitor.athlete?.flag?.href ?? null;
    const scores: ESPNRoundScore[] = [];

    const golferIsCut =
      maxRound >= 3 &&
      maxDataPeriod <= 2 &&
      r12Total !== null &&
      (cutLine === null || r12Total > cutLine);

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

