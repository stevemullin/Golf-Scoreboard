import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLeaderboard, type ScoreRow, type PickRow } from "../score-core.ts";

// ── fixture helpers ──────────────────────────────────────────────────────────
const row = (golferId: string, roundNumber: number, scoreToPar: number | null, flags: Partial<ScoreRow> = {}): ScoreRow => ({
  golferId,
  roundNumber,
  scoreToPar,
  holesCompleted: scoreToPar === null ? 0 : 18,
  isCut: false,
  isWd: false,
  isDq: false,
  teeTime: null,
  holeScores: null,
  ...flags,
});

const picksFor = (memberId: string, golferIds: string[]): PickRow[] =>
  golferIds.map((g) => ({ poolMemberId: memberId, golferId: g, golferName: g.toUpperCase() }));

// A filler field golfer so per-round max (penalty) scores are defined.
const fieldMax = (r1: number, r2: number, r3: number, r4: number): ScoreRow[] => [
  row("field-worst", 1, r1), row("field-worst", 2, r2), row("field-worst", 3, r3), row("field-worst", 4, r4),
];

test("best 4 of 6 — worst two golfers are dropped", () => {
  const scores: ScoreRow[] = [
    // 6 golfers, single-round event for simplicity (currentRound 1)
    row("a", 1, -5), row("b", 1, -3), row("c", 1, -1), row("d", 1, 0), row("e", 1, 4), row("f", 1, 9),
  ];
  const [entry] = buildLeaderboard({
    status: "active",
    currentRound: 1,
    members: [{ id: "m1", name: "Mullin" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a", "b", "c", "d", "e", "f"]),
  });
  // best 4 = -5 + -3 + -1 + 0 = -9; e (+4) and f (+9) dropped
  assert.equal(entry!.toPar, -9);
  const counted = entry!.rounds[0]!.golferDetails.filter((g) => g.counted).map((g) => g.golferId).sort();
  assert.deepEqual(counted, ["a", "b", "c", "d"]);
});

test("best 4 of 5 — historical 5-pick years score correctly", () => {
  const scores: ScoreRow[] = [row("a", 1, -4), row("b", 1, -2), row("c", 1, 0), row("d", 1, 1), row("e", 1, 7)];
  const [entry] = buildLeaderboard({
    status: "completed",
    currentRound: 1,
    members: [{ id: "m1", name: "Hof" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a", "b", "c", "d", "e"]),
  });
  assert.equal(entry!.toPar, -5); // drops only the +7
});

test("cut golfer takes the field-worst penalty in R3 AND R4", () => {
  const scores: ScoreRow[] = [
    ...fieldMax(2, 3, 9, 8),
    // survivor plays all four rounds at even
    row("a", 1, 0), row("a", 2, 0), row("a", 3, 0), row("a", 4, 0),
    // cut golfer: real R1/R2, an isCut marker row for R3, and NO R4 row at all
    row("cut", 1, 5), row("cut", 2, 6), row("cut", 3, null, { isCut: true }),
  ];
  const [entry] = buildLeaderboard({
    status: "completed",
    currentRound: 4,
    members: [{ id: "m1", name: "Ryan" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a", "cut"]),
  });
  const cutDetails = entry!.rounds.map((r) => r.golferDetails.find((g) => g.golferId === "cut")!);
  assert.equal(cutDetails[2]!.scoreToPar, 9); // R3 penalty = field worst
  assert.equal(cutDetails[2]!.isPenalty, true);
  assert.equal(cutDetails[3]!.scoreToPar, 8); // R4 penalty despite missing row
  assert.equal(cutDetails[3]!.isPenalty, true);
  // team total = a (0) + cut (5+6+9+8 = 28) = 28 (only 2 golfers, both counted)
  assert.equal(entry!.toPar, 28);
});

test("completed event: golfer with missing rounds is inferred cut (legacy imports)", () => {
  const scores: ScoreRow[] = [
    ...fieldMax(1, 2, 7, 6),
    row("a", 1, 0), row("a", 2, 0), row("a", 3, 0), row("a", 4, 0),
    // imported before the parser backfilled cut rows: only R1/R2 exist, no flags
    row("legacy", 1, 3), row("legacy", 2, 4),
  ];
  const [entry] = buildLeaderboard({
    status: "completed",
    currentRound: 4,
    members: [{ id: "m1", name: "Conway" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a", "legacy"]),
  });
  const legacy = entry!.rounds[3]!.golferDetails.find((g) => g.golferId === "legacy")!;
  assert.equal(legacy.isCut, true);
  assert.equal(legacy.isPenalty, true);
  assert.equal(legacy.scoreToPar, 6); // R4 field-worst
});

test("live event: a not-yet-started round is NOT a cut", () => {
  const scores: ScoreRow[] = [
    row("a", 1, -2),
    row("a", 2, null), // row exists, no score, no flags → simply hasn't teed off
  ];
  const [entry] = buildLeaderboard({
    status: "active",
    currentRound: 2,
    members: [{ id: "m1", name: "Curry" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a"]),
  });
  const g = entry!.rounds[1]!.golferDetails[0]!;
  assert.equal(g.isCut, false);
  assert.equal(g.isPenalty, false);
  assert.equal(g.scoreToPar, null);
  assert.equal(entry!.toPar, -2); // not-started counts as 0
});

test("members without picks rank below scored members with null totals", () => {
  const lb = buildLeaderboard({
    status: "active",
    currentRound: 1,
    members: [{ id: "m1", name: "NoPicks" }, { id: "m2", name: "HasPicks" }],
    allScores: [row("a", 1, -1)],
    allPicks: picksFor("m2", ["a"]),
  });
  assert.equal(lb[0]!.name, "HasPicks");
  assert.equal(lb[1]!.name, "NoPicks");
  assert.equal(lb[1]!.toPar, null);
});

test("ties share a rank and the next rank skips (1,1,3)", () => {
  const lb = buildLeaderboard({
    status: "completed",
    currentRound: 1,
    members: [{ id: "m1", name: "A" }, { id: "m2", name: "B" }, { id: "m3", name: "C" }],
    allScores: [row("x", 1, -5), row("y", 1, -5), row("z", 1, 2)],
    allPicks: [...picksFor("m1", ["x"]), ...picksFor("m2", ["y"]), ...picksFor("m3", ["z"])],
  });
  assert.deepEqual(lb.map((e) => e.rank), [1, 1, 3]);
});

test("thru shows F when all counted golfers finished the current round", () => {
  const scores: ScoreRow[] = [
    { ...row("a", 1, -1), holesCompleted: 18 },
  ];
  const [entry] = buildLeaderboard({
    status: "active",
    currentRound: 1,
    members: [{ id: "m1", name: "A" }],
    allScores: scores,
    allPicks: picksFor("m1", ["a"]),
  });
  assert.equal(entry!.thru, "F");
});
