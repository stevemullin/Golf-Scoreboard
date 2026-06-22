// Tiered-pick rule: one golfer from each of T1/T2/T3, plus T4+T5 totaling three
// with at least one each (i.e. a 6th from T4 or T5). All six distinct + tiered.
// Shared by the admin pick route and the self-service participant route.
export function validateTieredPicks(
  tierByGolfer: Map<string, number>,
  golferIds: string[],
): { valid: boolean; reason?: string } {
  if (golferIds.length !== 6) return { valid: false, reason: "Need exactly 6 picks" };
  if (new Set(golferIds).size !== 6) return { valid: false, reason: "Duplicate golfer in picks" };
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const id of golferIds) {
    const t = tierByGolfer.get(id);
    if (!t) return { valid: false, reason: "A pick is not assigned to any tier" };
    counts[t] = (counts[t] ?? 0) + 1;
  }
  if (counts[1] !== 1 || counts[2] !== 1 || counts[3] !== 1) {
    return { valid: false, reason: "Need exactly one golfer from each of T1, T2 and T3" };
  }
  if (counts[4]! + counts[5]! !== 3 || counts[4]! < 1 || counts[5]! < 1) {
    return { valid: false, reason: "Need one from T4 and one from T5, plus one extra from T4 or T5" };
  }
  return { valid: true };
}
