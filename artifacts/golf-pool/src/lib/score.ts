export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) return "-";
  if (score === 0) return "E";
  if (score > 0) return `+${score}`;
  return `${score}`;
}
