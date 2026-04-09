import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { 
  useGetScoreboard, 
  useGetManualScoreboard, 
  useGetTournaments, 
  useUpdateManualScore,
  getGetScoreboardQueryKey
} from "@workspace/api-client-react";
import { formatScore } from "@/lib/score";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";
import { Switch } from "@/components/ui/switch";

export default function Home() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"live" | "manual">("live");
  
  const { data: scoreboard, isLoading } = useGetScoreboard({
    query: {
      refetchInterval: 60000,
    }
  });

  const { data: manualScoreboard } = useGetManualScoreboard({
    query: {
      enabled: mode === "manual"
    }
  });

  const updateScore = useUpdateManualScore();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const [editName, setEditName] = useState(() => localStorage.getItem("golf_pool_editor") || "");

  useEffect(() => {
    localStorage.setItem("golf_pool_editor", editName);
  }, [editName]);

  const handleSaveManualScore = (tournamentId: string, poolMemberId: string, scores: {r1?: number|null, r2?: number|null, r3?: number|null, r4?: number|null}) => {
    updateScore.mutate({
      data: {
        tournamentId,
        poolMemberId,
        ...scores,
        updatedBy: editName || "Anonymous"
      }
    });
  };

  const scrollToTeam = (memberId: string) => {
    const el = document.getElementById(`team-${memberId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const activeTournament = scoreboard?.tournament;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-4 md:p-8 font-sans pb-24">
      <div className="max-w-7xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary uppercase tracking-wider">
              {activeTournament?.name || "Golf Pool"}
            </h1>
            <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground font-mono">
              <span>{activeTournament?.status === "completed" ? "Final" : `Round ${activeTournament?.currentRound || 1}`}</span>
              {scoreboard?.lastUpdated && (
                <span>| Updated: {new Date(scoreboard.lastUpdated).toLocaleTimeString()}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="flex items-center gap-2 bg-card px-4 py-2 rounded-lg border border-border">
              <span className={`text-sm font-bold ${mode === 'live' ? 'text-primary' : 'text-muted-foreground'}`}>Live</span>
              <Switch 
                checked={mode === "manual"} 
                onCheckedChange={(c) => setMode(c ? "manual" : "live")} 
              />
              <span className={`text-sm font-bold ${mode === 'manual' ? 'text-primary' : 'text-muted-foreground'}`}>Manual</span>
            </div>
            <Link href="/admin" className="text-sm font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors uppercase tracking-widest">
              Admin
            </Link>
          </div>
        </header>

        {isLoading && !scoreboard ? (
          <div className="animate-pulse space-y-8">
            <div className="h-96 bg-card/50 rounded-xl border border-border"></div>
            <div className="h-64 bg-card/50 rounded-xl border border-border"></div>
          </div>
        ) : (
          <main className="space-y-12">
            <Card className="bg-card border-card-border overflow-hidden rounded-xl shadow-xl shadow-black/50">
              <Table>
                <TableHeader className="bg-black/40">
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="w-16 text-center text-muted-foreground uppercase font-bold text-xs tracking-wider">Pos</TableHead>
                    <TableHead className="text-muted-foreground uppercase font-bold text-xs tracking-wider">Player</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider">Total</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider hidden sm:table-cell">Thru</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider hidden sm:table-cell">Today</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider">R1</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider">R2</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider hidden md:table-cell">R3</TableHead>
                    <TableHead className="text-right text-muted-foreground uppercase font-bold text-xs tracking-wider hidden md:table-cell">R4</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {mode === "live" ? (
                    scoreboard?.leaderboard.map((entry) => (
                      <TableRow 
                        key={entry.poolMemberId} 
                        className="border-border hover:bg-white/5 cursor-pointer transition-colors"
                        onClick={() => scrollToTeam(entry.poolMemberId)}
                      >
                        <TableCell className="text-center font-mono font-bold text-lg">{entry.rank}</TableCell>
                        <TableCell className="font-bold text-lg">{entry.name}</TableCell>
                        <TableCell className={`text-right font-mono font-bold text-lg ${entry.toPar !== null && entry.toPar < 0 ? 'text-primary' : entry.toPar && entry.toPar > 0 ? 'text-muted-foreground' : ''}`}>
                          {formatScore(entry.toPar)}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm font-mono hidden sm:table-cell">{entry.thru}</TableCell>
                        <TableCell className="text-right font-mono text-sm hidden sm:table-cell">{formatScore(entry.today)}</TableCell>
                        <TableCell className="text-right font-mono">{formatScore(entry.r1)}</TableCell>
                        <TableCell className="text-right font-mono">{formatScore(entry.r2)}</TableCell>
                        <TableCell className="text-right font-mono hidden md:table-cell">{formatScore(entry.r3)}</TableCell>
                        <TableCell className="text-right font-mono hidden md:table-cell">{formatScore(entry.r4)}</TableCell>
                      </TableRow>
                    ))
                  ) : (
                    manualScoreboard?.leaderboard.map((entry, idx) => (
                      <ManualTableRow 
                        key={entry.poolMemberId} 
                        entry={entry} 
                        rank={idx + 1}
                        onSave={(scores) => activeTournament && handleSaveManualScore(activeTournament.id, entry.poolMemberId, scores)}
                      />
                    ))
                  )}
                </TableBody>
              </Table>
              {mode === "manual" && (
                <div className="p-4 bg-black/20 border-t border-border flex items-center justify-between">
                   <div className="flex items-center gap-2">
                     <span className="text-sm text-muted-foreground">Editor Name:</span>
                     <Input 
                       value={editName}
                       onChange={e => setEditName(e.target.value)}
                       className="w-48 bg-background h-8"
                       placeholder="Your Name"
                     />
                   </div>
                </div>
              )}
            </Card>

            {mode === "live" && (
              <div className="space-y-6">
                <h2 className="text-2xl font-bold uppercase tracking-wider text-muted-foreground border-b border-border pb-2">Team Details</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scoreboard?.leaderboard.map(entry => (
                    <Card key={entry.poolMemberId} id={`team-${entry.poolMemberId}`} className="bg-card border-card-border overflow-hidden rounded-xl shadow-lg">
                      <div className="bg-black/40 p-4 border-b border-border flex items-center justify-between">
                        <h3 className="font-bold text-xl">{entry.name}'s Team</h3>
                        <span className={`text-2xl font-mono font-bold ${entry.toPar !== null && entry.toPar < 0 ? 'text-primary' : entry.toPar && entry.toPar > 0 ? 'text-muted-foreground' : ''}`}>
                          {formatScore(entry.toPar)}
                        </span>
                      </div>
                      <div className="p-0">
                        {entry.rounds.length > 0 ? (
                          <Table>
                            <TableHeader className="bg-transparent border-b border-border/50">
                              <TableRow className="border-none hover:bg-transparent">
                                <TableHead className="text-xs uppercase tracking-wider text-muted-foreground">Golfer</TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Score</TableHead>
                                <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground">Thru</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {entry.rounds[entry.rounds.length - 1].golferDetails.map((golfer) => (
                                <TableRow key={golfer.golferId} className={`border-border/20 hover:bg-white/5 ${golfer.counted === false ? 'opacity-40' : ''}`}>
                                  <TableCell className="font-semibold flex items-center gap-2">
                                    {golfer.golferName}
                                    {golfer.isCut && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">CUT</Badge>}
                                    {golfer.isWd && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">WD</Badge>}
                                    {golfer.isDq && <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">DQ</Badge>}
                                  </TableCell>
                                  <TableCell className={`text-right font-mono ${golfer.scoreToPar !== null && golfer.scoreToPar < 0 ? 'text-primary' : ''} ${golfer.counted === false ? 'line-through' : ''} ${golfer.isPenalty ? 'italic text-destructive' : ''}`}>
                                    {formatScore(golfer.scoreToPar)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono text-muted-foreground text-sm">
                                    {golfer.holesCompleted > 0 ? (golfer.holesCompleted === 18 ? 'F' : golfer.holesCompleted) : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        ) : (
                          <div className="p-8 text-center text-muted-foreground">No round data available yet.</div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </main>
        )}
      </div>
    </div>
  );
}

function ManualTableRow({ entry, rank, onSave }: { entry: any, rank: number, onSave: (scores: any) => void }) {
  const [r1, setR1] = useState<string>(entry.r1?.toString() || "");
  const [r2, setR2] = useState<string>(entry.r2?.toString() || "");
  const [r3, setR3] = useState<string>(entry.r3?.toString() || "");
  const [r4, setR4] = useState<string>(entry.r4?.toString() || "");
  
  const total = [r1, r2, r3, r4].reduce((sum, val) => sum + (parseInt(val) || 0), 0);

  const handleSave = () => {
    onSave({
      r1: r1 ? parseInt(r1) : null,
      r2: r2 ? parseInt(r2) : null,
      r3: r3 ? parseInt(r3) : null,
      r4: r4 ? parseInt(r4) : null,
    });
  };

  return (
    <TableRow className="border-border">
      <TableCell className="text-center font-mono font-bold text-lg">{rank}</TableCell>
      <TableCell>
        <div className="font-bold text-lg">{entry.poolMemberName}</div>
        {entry.updatedBy && (
          <div className="text-xs text-muted-foreground mt-1">Edited by {entry.updatedBy}</div>
        )}
      </TableCell>
      <TableCell className={`text-right font-mono font-bold text-lg ${total < 0 ? 'text-primary' : total > 0 ? 'text-muted-foreground' : ''}`}>
        {formatScore(total)}
      </TableCell>
      <TableCell className="hidden sm:table-cell"></TableCell>
      <TableCell className="hidden sm:table-cell"></TableCell>
      <TableCell className="text-right">
        <Input value={r1} onChange={e => setR1(e.target.value)} className="w-16 ml-auto text-right font-mono h-8" />
      </TableCell>
      <TableCell className="text-right">
        <Input value={r2} onChange={e => setR2(e.target.value)} className="w-16 ml-auto text-right font-mono h-8" />
      </TableCell>
      <TableCell className="text-right hidden md:table-cell">
        <Input value={r3} onChange={e => setR3(e.target.value)} className="w-16 ml-auto text-right font-mono h-8" />
      </TableCell>
      <TableCell className="text-right hidden md:table-cell">
        <Input value={r4} onChange={e => setR4(e.target.value)} className="w-16 ml-auto text-right font-mono h-8" />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" onClick={handleSave} className="uppercase font-bold tracking-wider text-xs">Save</Button>
      </TableCell>
    </TableRow>
  );
}
