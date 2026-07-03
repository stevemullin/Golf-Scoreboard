import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEvent } from "../espn-parse.ts";

// Minimal ESPN event fixture: one survivor with 4 rounds, one golfer cut after R2.
const hole = (strokes: string, toPar: string) => ({ displayValue: strokes, scoreType: { displayValue: toPar } });

const fixture = {
  id: "401",
  name: "Test Major",
  date: "2026-06-18T04:00Z",
  endDate: "2026-06-21T04:00Z",
  status: { type: { state: "post", completed: true, description: "Final", shortDetail: "Final" } },
  competitions: [
    {
      broadcasts: [{ names: ["NBC", "Peacock"] }, { names: ["NBC"] }],
      competitors: [
        {
          id: "g1",
          athlete: { displayName: "Survivor Sam" },
          linescores: [
            { period: 1, value: 68, displayValue: "-2", linescores: [hole("4", "E"), hole("3", "-1")] },
            { period: 2, value: 70, displayValue: "E", linescores: [hole("4", "E")] },
            { period: 3, value: 69, displayValue: "-1", linescores: [hole("4", "E")] },
            { period: 4, value: 71, displayValue: "+1", linescores: [hole("5", "+1")] },
          ],
        },
        {
          id: "g2",
          athlete: { displayName: "Cut Carl" },
          linescores: [
            { period: 1, value: 74, displayValue: "+4", linescores: [] },
            { period: 2, value: 75, displayValue: "+5", linescores: [] },
          ],
        },
      ],
    },
  ],
};

test("event status: dates, dedup'd broadcasts, detail, currentRound", () => {
  const parsed = parseEvent(fixture)!;
  assert.equal(parsed.eventStatus.completed, true);
  assert.equal(parsed.eventStatus.state, "post");
  assert.equal(parsed.eventStatus.currentRound, 4);
  assert.equal(parsed.eventStatus.startDate, "2026-06-18T04:00Z");
  assert.deepEqual(parsed.eventStatus.broadcasts, ["NBC", "Peacock"]);
  assert.equal(parsed.eventStatus.statusDetail, "Final");
});

test("scores parse: E/-/+ values and per-hole JSON", () => {
  const parsed = parseEvent(fixture)!;
  const sam = parsed.golfers.find((g) => g.espnId === "g1")!;
  const r1 = sam.scores.find((s) => s.roundNumber === 1)!;
  assert.equal(r1.scoreToPar, -2);
  assert.equal(r1.holesCompleted, 2);
  assert.deepEqual(JSON.parse(r1.holeScores!), [{ s: "4", p: "E" }, { s: "3", p: "-1" }]);
  assert.equal(sam.scores.find((s) => s.roundNumber === 2)!.scoreToPar, 0); // "E"
  assert.equal(sam.scores.find((s) => s.roundNumber === 4)!.scoreToPar, 1); // "+1"
});

test("cut golfer: missing R3/R4 rows are backfilled as isCut", () => {
  const parsed = parseEvent(fixture)!;
  const carl = parsed.golfers.find((g) => g.espnId === "g2")!;
  assert.equal(carl.scores.length, 4); // R1, R2 real + R3, R4 backfilled
  const r3 = carl.scores.find((s) => s.roundNumber === 3)!;
  const r4 = carl.scores.find((s) => s.roundNumber === 4)!;
  assert.equal(r3.isCut, true);
  assert.equal(r3.scoreToPar, null);
  assert.equal(r4.isCut, true);
  // …while his real rounds keep their actual scores
  assert.equal(carl.scores.find((s) => s.roundNumber === 1)!.scoreToPar, 4);
  assert.equal(carl.scores.find((s) => s.roundNumber === 1)!.isCut, false);
});

test("survivor is not flagged cut", () => {
  const parsed = parseEvent(fixture)!;
  const sam = parsed.golfers.find((g) => g.espnId === "g1")!;
  assert.ok(sam.scores.every((s) => !s.isCut));
});
