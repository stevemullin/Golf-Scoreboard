import { useEffect } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
import { majorTheme } from "@/lib/major-theme";

type Member = {
  name: string; played: number; wins: number; winRate: number;
  avgFinish: number | null; bestFinish: number | null; avgScore: number | null; bestScore: number | null;
};
type EventRow = { name: string; year: number; winners: string[]; winnerScore: number | null; field: number };
type History = {
  totalEvents: number; years: number[]; members: Member[]; events: EventRow[];
  topGolfers: { name: string; count: number }[];
  records: { bestRound: { member: string; event: string; toPar: number } | null; worstRound: { member: string; event: string; toPar: number } | null };
};

const par = (n: number | null | undefined) => (n == null ? "—" : n === 0 ? "E" : n > 0 ? `+${n}` : `${n}`);

export default function HistoryPage() {
  useEffect(() => { document.documentElement.classList.add("dark"); }, []);
  const { data, isLoading } = useQuery<History | null>({
    queryKey: ["history"],
    queryFn: async () => {
      const r = await fetch("/api/history");
      return r.ok ? r.json() : null;
    },
  });

  // Cumulative titles per member across events (oldest → newest) for the chart.
  const PALETTE = ["#f5c518", "#4f9cf9", "#34d399", "#f87171", "#c084fc", "#fb923c", "#22d3ee", "#a3e635"];
  const chart = (() => {
    if (!data || data.totalEvents === 0) return null;
    const ordered = [...data.events].reverse();
    const names = data.members.map((m) => m.name);
    const tally = new Map<string, number>(names.map((n) => [n, 0]));
    const points = ordered.map((e) => {
      for (const w of e.winners) tally.set(w, (tally.get(w) ?? 0) + 1);
      const pt: Record<string, string | number> = { event: e.name };
      for (const n of names) pt[n] = tally.get(n) ?? 0;
      return pt;
    });
    return { points, names };
  })();

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-4 md:p-8 pb-24 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-4xl font-bold uppercase tracking-wider text-primary">🏆 Pool History</h1>
            {data && data.totalEvents > 0 && (
              <p className="text-sm text-muted-foreground font-mono mt-2">
                {data.totalEvents} events · {data.years[data.years.length - 1]}–{data.years[0]} · {data.members.length} players
              </p>
            )}
          </div>
          <Link href="/" className="text-sm font-bold text-primary border border-primary/30 px-4 py-2 rounded-lg hover:bg-primary/10 transition-colors uppercase tracking-widest whitespace-nowrap">
            Scoreboard
          </Link>
        </header>

        {isLoading ? (
          <p className="text-muted-foreground text-center py-16">Crunching the numbers…</p>
        ) : !data || data.totalEvents === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-xl font-bold uppercase tracking-wider">No completed events yet</p>
            <p className="text-sm mt-2">Import past majors from the <Link href="/admin" className="text-primary hover:underline">Admin</Link> panel to build history.</p>
          </div>
        ) : (
          <main className="space-y-10">
            {/* Records */}
            {(data.records.bestRound || data.records.worstRound) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {data.records.bestRound && (
                  <Card className="bg-card border-card-border">
                    <CardContent className="p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Best team ever</div>
                      <div className="text-2xl font-bold font-mono text-primary">{par(data.records.bestRound.toPar)}</div>
                      <div className="text-sm">{data.records.bestRound.member} · {data.records.bestRound.event}</div>
                    </CardContent>
                  </Card>
                )}
                {data.records.worstRound && (
                  <Card className="bg-card border-card-border">
                    <CardContent className="p-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Worst team ever</div>
                      <div className="text-2xl font-bold font-mono text-muted-foreground">{par(data.records.worstRound.toPar)}</div>
                      <div className="text-sm">{data.records.worstRound.member} · {data.records.worstRound.event}</div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Title race over time */}
            {chart && chart.points.length > 1 && (
              <Card className="bg-card border-card-border overflow-hidden rounded-xl shadow-lg">
                <CardHeader className="bg-black/40 border-b border-border"><CardTitle className="text-xl uppercase tracking-wider text-primary">Title Race</CardTitle></CardHeader>
                <CardContent className="p-4 pt-6">
                  <div className="h-64 md:h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chart.points} margin={{ top: 4, right: 12, bottom: 4, left: -24 }}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                        <XAxis dataKey="event" tick={false} axisLine={{ stroke: "rgba(255,255,255,0.15)" }} />
                        <YAxis allowDecimals={false} tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: "#101613", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}
                        />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        {chart.names.map((n, i) => (
                          <Line key={n} type="stepAfter" dataKey={n} stroke={PALETTE[i % PALETTE.length]} strokeWidth={2} dot={false} />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Cumulative titles, every major {data.years[data.years.length - 1]}–{data.years[0]}.</p>
                </CardContent>
              </Card>
            )}

            {/* All-time standings */}
            <Card className="bg-card border-card-border overflow-hidden rounded-xl shadow-lg">
              <CardHeader className="bg-black/40 border-b border-border"><CardTitle className="text-xl uppercase tracking-wider text-primary">All-Time Standings</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-black/20">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground uppercase text-xs tracking-wider">Player</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">🏆</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">Played</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">Win %</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">Avg Fin</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">Best Fin</TableHead>
                      <TableHead className="text-right text-muted-foreground uppercase text-xs tracking-wider">Avg Score</TableHead>
                      <TableHead className="text-right text-muted-foreground uppercase text-xs tracking-wider">Best</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.members.map((m) => (
                      <TableRow key={m.name} className="border-border/30 hover:bg-white/5">
                        <TableCell className="font-bold">{m.name}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-primary">{m.wins || ""}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{m.played}</TableCell>
                        <TableCell className="text-center font-mono">{m.winRate}%</TableCell>
                        <TableCell className="text-center font-mono">{m.avgFinish ?? "—"}</TableCell>
                        <TableCell className="text-center font-mono">{m.bestFinish ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono">{par(m.avgScore)}</TableCell>
                        <TableCell className={`text-right font-mono ${m.bestScore != null && m.bestScore < 0 ? "text-primary" : ""}`}>{par(m.bestScore)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Champions by event */}
            <Card className="bg-card border-card-border overflow-hidden rounded-xl shadow-lg">
              <CardHeader className="bg-black/40 border-b border-border"><CardTitle className="text-xl uppercase tracking-wider text-primary">Champions</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader className="bg-black/20">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground uppercase text-xs tracking-wider">Event</TableHead>
                      <TableHead className="text-muted-foreground uppercase text-xs tracking-wider">Winner</TableHead>
                      <TableHead className="text-right text-muted-foreground uppercase text-xs tracking-wider">Score</TableHead>
                      <TableHead className="text-center text-muted-foreground uppercase text-xs tracking-wider">Field</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.map((e) => (
                      <TableRow key={e.name} className="border-border/30 hover:bg-white/5">
                        <TableCell className="font-semibold">
                          <span className="inline-block w-2.5 h-2.5 rounded-full mr-2 align-middle" style={{ background: majorTheme(e.name).dot }} />
                          {e.name}
                        </TableCell>
                        <TableCell className="font-bold text-primary">🏆 {e.winners.join(" / ")}</TableCell>
                        <TableCell className="text-right font-mono">{par(e.winnerScore)}</TableCell>
                        <TableCell className="text-center font-mono text-muted-foreground">{e.field}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Most-picked golfers */}
            {data.topGolfers.length > 0 && (
              <Card className="bg-card border-card-border overflow-hidden rounded-xl shadow-lg">
                <CardHeader className="bg-black/40 border-b border-border"><CardTitle className="text-xl uppercase tracking-wider text-primary">Most-Picked Golfers</CardTitle></CardHeader>
                <CardContent className="p-4 space-y-1.5">
                  {data.topGolfers.map((g) => {
                    const max = data.topGolfers[0].count || 1;
                    return (
                      <div key={g.name} className="flex items-center gap-3">
                        <span className="w-44 shrink-0 truncate text-sm">{g.name}</span>
                        <div className="flex-1 bg-background rounded h-4 overflow-hidden">
                          <div className="h-full bg-primary/40" style={{ width: `${(g.count / max) * 100}%` }} />
                        </div>
                        <span className="w-8 text-right font-mono text-sm text-muted-foreground">{g.count}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </main>
        )}
      </div>
    </div>
  );
}
