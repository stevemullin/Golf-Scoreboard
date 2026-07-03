// Hand-maintained types for API responses that postdate the generated client
// (lib/api-client-react). Keeping them here removes the `as any` casts in pages
// until the OpenAPI spec + client are regenerated.

export interface TournamentInfo {
  id: string;
  name: string;
  year: number;
  espnEventId: string | null;
  status: string;
  currentRound: number;
  isActive: boolean;
  cutSize: number | null;
  picksLockAt: string | null;
  startDate: string | null;
  endDate: string | null;
  broadcasts: string | null;
  statusDetail: string | null;
  createdAt: string;
}

export interface GolferRoundDetail {
  golferId: string;
  golferName: string;
  golferEspnId?: string | null;
  golferFlag?: string | null;
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
  bestSingle?: number | null;
  thru: string;
  today: number | null;
  r1: number | null;
  r2: number | null;
  r3: number | null;
  r4: number | null;
  rounds: RoundScore[];
}

export interface RosterEntry {
  poolMemberId: string;
  name: string;
  submitted: boolean;
  pickCount: number;
}

export interface ScoreboardResponse {
  tournament: TournamentInfo;
  lastUpdated: string | null;
  nextUpdate: string | null;
  refreshIntervalMinutes: number;
  projectedCut: number | null;
  picksRevealed: boolean;
  roster: RosterEntry[];
  leaderboard: LeaderboardEntry[];
}
