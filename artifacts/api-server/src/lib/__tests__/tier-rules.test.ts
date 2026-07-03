import { test } from "node:test";
import assert from "node:assert/strict";
import { validateTieredPicks } from "../tier-rules.ts";

// Tier map: g1..g3 in T1..T3, g4a/g4b in T4, g5a/g5b in T5.
const tiers = new Map<string, number>([
  ["g1", 1], ["g2", 2], ["g3", 3],
  ["g4a", 4], ["g4b", 4],
  ["g5a", 5], ["g5b", 5],
]);

test("valid: one per tier + extra from T4", () => {
  assert.equal(validateTieredPicks(tiers, ["g1", "g2", "g3", "g4a", "g4b", "g5a"]).valid, true);
});

test("valid: one per tier + extra from T5", () => {
  assert.equal(validateTieredPicks(tiers, ["g1", "g2", "g3", "g4a", "g5a", "g5b"]).valid, true);
});

test("invalid: three from T4/none from T5", () => {
  const v = validateTieredPicks(new Map([...tiers, ["g4c", 4]]), ["g1", "g2", "g3", "g4a", "g4b", "g4c"]);
  assert.equal(v.valid, false);
});

test("invalid: two from T1", () => {
  const v = validateTieredPicks(new Map([...tiers, ["g1b", 1]]), ["g1", "g1b", "g3", "g4a", "g5a", "g5b"]);
  assert.equal(v.valid, false);
});

test("invalid: only 5 picks", () => {
  assert.equal(validateTieredPicks(tiers, ["g1", "g2", "g3", "g4a", "g5a"]).valid, false);
});

test("invalid: duplicate golfer", () => {
  assert.equal(validateTieredPicks(tiers, ["g1", "g1", "g3", "g4a", "g4b", "g5a"]).valid, false);
});

test("invalid: pick not in any tier", () => {
  assert.equal(validateTieredPicks(tiers, ["g1", "g2", "g3", "g4a", "g5a", "mystery"]).valid, false);
});
