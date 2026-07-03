import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiErr, isUnauth, type TournamentLite } from "./utils";

export function TiersCard({ password, onAuthFail, tournaments }: { password: string; onAuthFail: () => void; tournaments: TournamentLite[] | undefined }) {
  const { toast } = useToast();
  const [tierTourneyId, setTierTourneyId] = useState("");
  const [tierList, setTierList] = useState<{ golferId: string; name: string; odds: number | null }[]>([]);
  const [tierBreaks, setTierBreaks] = useState<number[]>([]); // up to 4 sorted indices where a new tier starts
  const [tierBusy, setTierBusy] = useState(false);
  const tierListRef = React.useRef<HTMLDivElement>(null);
  const dragK = React.useRef<number | null>(null);

  const tierAt = (i: number, breaks: number[]) => Math.min(5, 1 + breaks.filter((b) => b <= i).length);

  // up to 4 distinct sorted break indices in [1, len-1]
  const normalizeBreaks = (raw: number[], len: number): number[] => {
    const set = new Set(raw.filter((b) => b >= 1 && b <= len - 1));
    for (let k = 1; k <= 4 && set.size < 4 && len >= 5; k++) {
      const p = Math.round((len * k) / 5);
      if (p >= 1 && p <= len - 1) set.add(p);
    }
    return Array.from(set).sort((a, b) => a - b).slice(0, 4);
  };

  // Default splits: 8 golfers per tier (T1 1-8, T2 9-16, T3 17-24, T4 25-32, T5 33+).
  const evenEight = (len: number): number[] =>
    Array.from(new Set([8, 16, 24, 32].map((p) => Math.min(p, len - 1)).filter((p) => p >= 1))).sort((a, b) => a - b);

  const loadTiers = async (tid: string) => {
    setTierTourneyId(tid);
    setTierList([]);
    setTierBreaks([]);
    if (!tid) return;
    try {
      const res = await fetch(`/api/admin/tiers?tournamentId=${tid}`);
      if (!res.ok) return;
      const rows = await res.json();
      const prob = (a: number | null) => (a == null ? -1 : a >= 0 ? 100 / (a + 100) : -a / (-a + 100));
      if (Array.isArray(rows) && rows.length) {
        rows.sort((a: any, b: any) => a.tier - b.tier || prob(b.odds) - prob(a.odds));
        const list = rows.map((r: any) => ({ golferId: r.golferId, name: r.name, odds: r.odds ?? null }));
        const breaks: number[] = [];
        for (let i = 1; i < rows.length; i++) if (rows[i].tier !== rows[i - 1].tier) breaks.push(i);
        setTierList(list);
        setTierBreaks(normalizeBreaks(breaks, list.length));
      }
    } catch { /* ignore */ }
  };

  const buildTiers = async () => {
    if (!tierTourneyId) return;
    setTierBusy(true);
    try {
      const res = await fetch("/api/admin/tiers/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tierTourneyId, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { onAuthFail(); return; }
        toast({ title: "Couldn't build tiers", description: data?.error || "", variant: "destructive" });
        return;
      }
      const list = [
        ...data.matched.map((m: any) => ({ golferId: m.golferId, name: m.name, odds: m.odds })),
        ...data.unmatched.map((u: any) => ({ golferId: u.golferId, name: u.name, odds: null })),
      ];
      setTierList(list);
      setTierBreaks(evenEight(list.length));
      if (data.matched.length === 0) {
        toast({ title: "No odds posted for this event", description: "A major is only priced from ~3 weeks before until it ends. Right now just the upcoming major (The Open) has odds.", variant: "destructive" });
      } else {
        toast({ title: "Tiers built from odds", description: `${data.matched.length} matched · ${data.unmatched.length} unmatched (T5)` });
      }
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    } finally {
      setTierBusy(false);
    }
  };

  // move the divider nearest to gap p (before golfer index p) to p
  const TIER_ROW = 32; // px per row — must match the row height in the list below

  // Move divider k to a new index, clamped strictly between its neighbours so
  // dividers can never cross or coincide (keeps the 4 splits ordered).
  const setDivider = (k: number, idx: number) => {
    setTierBreaks((breaks) => {
      const len = tierList.length;
      const lo = k === 0 ? 1 : breaks[k - 1]! + 1;
      const hi = k === breaks.length - 1 ? len - 1 : breaks[k + 1]! - 1;
      const clamped = Math.max(lo, Math.min(hi, idx));
      if (clamped === breaks[k]) return breaks;
      const next = breaks.slice();
      next[k] = clamped;
      return next;
    });
  };

  const onHandleDown = (k: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragK.current = k;
  };
  const onHandleMove = (e: React.PointerEvent) => {
    const el = tierListRef.current;
    if (dragK.current == null || !el) return;
    const rect = el.getBoundingClientRect();
    setDivider(dragK.current, Math.round((e.clientY - rect.top + el.scrollTop) / TIER_ROW));
    if (e.clientY < rect.top + 24) el.scrollTop -= 12;
    else if (e.clientY > rect.bottom - 24) el.scrollTop += 12;
  };
  const onHandleUp = (e: React.PointerEvent) => {
    if (dragK.current != null) e.currentTarget.releasePointerCapture(e.pointerId);
    dragK.current = null;
  };

  const saveTiers = async () => {
    if (!tierTourneyId || !tierList.length) return;
    setTierBusy(true);
    try {
      const assignments = tierList.map((g, i) => ({ golferId: g.golferId, tier: tierAt(i, tierBreaks), odds: g.odds }));
      const res = await fetch("/api/admin/tiers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournamentId: tierTourneyId, assignments, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401) { onAuthFail(); return; }
        toast({ title: "Save failed", description: data?.error || "", variant: "destructive" });
        return;
      }
      if (Array.isArray(data.warnings) && data.warnings.length) {
        toast({ title: `Tiers saved — ${data.warnings.length} team(s) now have invalid picks`, description: data.warnings.slice(0, 4).join(" · "), variant: "destructive" });
      } else {
        toast({ title: "Tiers saved", description: `${data.saved} golfers` });
      }
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    } finally {
      setTierBusy(false);
    }
  };

  return (
<Card className="bg-card border-card-border shadow-lg">
            <CardHeader className="bg-black/20 border-b border-border">
              <CardTitle className="text-xl uppercase tracking-wider text-primary">Golfer Tiers</CardTitle>
              <CardDescription>Build 5 tiers from the major's winner odds, then adjust. Majors only; unmatched golfers default to T5.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={tierTourneyId} onValueChange={loadTiers}>
                  <SelectTrigger className="w-[260px]"><SelectValue placeholder="Select tournament" /></SelectTrigger>
                  <SelectContent>
                    {tournaments?.map((t: any) => (<SelectItem key={t.id} value={t.id}>{t.name} {t.year}</SelectItem>))}
                  </SelectContent>
                </Select>
                <Button onClick={buildTiers} disabled={!tierTourneyId || tierBusy} className="uppercase font-bold tracking-wider">
                  {tierBusy ? "Working…" : "Build from odds"}
                </Button>
                <Button onClick={saveTiers} disabled={!tierTourneyId || !tierList.length || tierBusy} variant="outline" className="uppercase font-bold tracking-wider border-border">
                  Save tiers
                </Button>
              </div>
              {tierList.length === 0 ? (
                <p className="text-sm text-muted-foreground">Pick a major and "Build from odds" to populate the list (or it loads saved tiers automatically).</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Players stay in odds order. <strong className="text-foreground">Drag a divider line</strong> (or use its ▲▼) to set where each tier splits — amber lines mark the biggest odds gaps. {" "}
                    {[1, 2, 3, 4, 5].map((t) => `T${t}:${tierList.filter((_, i) => tierAt(i, tierBreaks) === t).length}`).join(" · ")}
                  </p>
                  <div ref={tierListRef} className="max-h-[520px] overflow-y-auto rounded border border-border/40 relative select-none">
                    <div className="relative" style={{ height: tierList.length * TIER_ROW }}>
                      {tierList.map((g, i) => {
                        const t = tierAt(i, tierBreaks);
                        const tierBg = ["", "bg-primary/10", "bg-sky-500/10", "bg-emerald-500/10", "bg-amber-500/10", "bg-muted/40"][t];
                        const prob = (x: number | null) => (x == null ? null : x >= 0 ? 100 / (x + 100) : -x / (-x + 100));
                        const prev = i > 0 ? tierList[i - 1] : null;
                        const pa = prev ? prob(prev.odds) : null;
                        const pc = prob(g.odds);
                        const bigGap = pa != null && pc != null && (pa - pc) * 100 >= 1;
                        return (
                          <div
                            key={g.golferId}
                            className={`absolute left-0 right-0 flex items-center justify-between gap-2 text-sm px-2 ${tierBg} ${bigGap ? "border-t border-amber-500/50" : ""}`}
                            style={{ top: i * TIER_ROW, height: TIER_ROW }}
                          >
                            <span className="truncate"><span className="text-muted-foreground text-xs mr-2 tabular-nums">{i + 1}</span>{g.name}</span>
                            <span className="font-mono text-xs text-muted-foreground shrink-0">{g.odds != null ? (g.odds > 0 ? `+${g.odds}` : `${g.odds}`) : "—"}</span>
                          </div>
                        );
                      })}
                      {tierBreaks.map((b, k) => {
                        const prob = (x: number | null) => (x == null ? null : x >= 0 ? 100 / (x + 100) : -x / (-x + 100));
                        const pa = b > 0 ? prob(tierList[b - 1]?.odds ?? null) : null;
                        const pc = prob(tierList[b]?.odds ?? null);
                        const jump = pa != null && pc != null ? Math.round((pa - pc) * 1000) / 10 : null;
                        return (
                          <div
                            key={k}
                            onPointerDown={onHandleDown(k)}
                            onPointerMove={onHandleMove}
                            onPointerUp={onHandleUp}
                            className="absolute left-0 right-0 z-10 flex items-center cursor-grab active:cursor-grabbing"
                            style={{ top: b * TIER_ROW - 11, height: 22, touchAction: "none" }}
                          >
                            <div className="h-0.5 w-full bg-primary" />
                            <div className="absolute right-1 flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow">
                              <span>T{k + 1}▕T{k + 2}</span>
                              {jump != null ? <span className="font-normal normal-case opacity-80">{jump}%</span> : null}
                              <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDivider(k, b - 1); }} className="px-0.5 leading-none hover:opacity-70" title="Up one">▲</button>
                              <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setDivider(k, b + 1); }} className="px-0.5 leading-none hover:opacity-70" title="Down one">▼</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
  );
}
