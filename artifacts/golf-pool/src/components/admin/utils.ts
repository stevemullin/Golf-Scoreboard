// Shared helpers for the admin feature cards.
/* eslint-disable @typescript-eslint/no-explicit-any */
export const apiErr = (e: unknown) => (e as any)?.data?.error || (e as any)?.message || "An error occurred";
export const isUnauth = (e: unknown) => (e as any)?.status === 401 || (e as any)?.data?.error === "Invalid password";

// Structural subset of the tournaments payload the cards actually read.
export interface TournamentLite {
  id: string;
  name: string;
  year: number;
  espnEventId?: string | null;
  isActive: boolean;
  status?: string;
  currentRound?: number;
  cutSize?: number | null;
  picksLockAt?: string | null;
  [key: string]: any;
}
