import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiErr, isUnauth, type TournamentLite } from "./utils";

export function ImportCard({ password, onAuthFail, refetchTournaments }: { password: string; onAuthFail: () => void; refetchTournaments: () => void }) {
  const { toast } = useToast();
  const [importYear, setImportYear] = useState(String(new Date().getFullYear()));
  const [importMajor, setImportMajor] = useState("Masters");
  const [importPicks, setImportPicks] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<{ name: string; golfers: number; members: { name: string; matched: number; unmatched: string[] }[] } | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkResult, setBulkResult] = useState<{ ok: boolean; name?: string; year?: number; major?: string; error?: string; members?: { name: string; matched: number; unmatched: string[] }[] }[] | null>(null);

  const handleImportHistorical = () => {
    const picks = importPicks.split("\n").map((line) => {
      const idx = line.indexOf(":");
      if (idx === -1) return null;
      const member = line.slice(0, idx).trim();
      const golfers = line.slice(idx + 1).split(",").map((s) => s.trim()).filter(Boolean);
      return member && golfers.length ? { member, golfers } : null;
    }).filter(Boolean);
    if (!picks.length) {
      toast({ title: "Add picks first", description: "One line per member — e.g. \"Hof: Rory McIlroy, Sam Burns, …\"", variant: "destructive" });
      return;
    }
    setImportBusy(true);
    setImportResult(null);
    fetch("/api/admin/import-historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, year: Number(importYear), major: importMajor, picks }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (r.status === 401) { onAuthFail(); return; }
        if (!r.ok) { toast({ title: "Import failed", description: d.error || "", variant: "destructive" }); return; }
        setImportResult(d);
        toast({ title: "Imported", description: `${d.name}: ${d.golfers} golfers, ${d.members?.length || 0} teams` });
        refetchTournaments();
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }))
      .finally(() => setImportBusy(false));
  };

  const parseBulkEvents = (text: string) => {
    const events: { year: number; major: string; picks: { member: string; golfers: string[] }[] }[] = [];
    let cur: { year: number; major: string; picks: { member: string; golfers: string[] }[] } | null = null;
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith("#")) {
        const h = line.replace(/^#+/, "").trim();
        const ym = h.match(/(20\d{2})/);
        const year = ym ? Number(ym[1]) : null;
        let major: string | null = null;
        if (/master/i.test(h)) major = "Masters";
        else if (/pga/i.test(h)) major = "PGA Championship";
        else if (/u\.?\s*s\.?\s*open|\bus open\b/i.test(h)) major = "U.S. Open";
        else if (/british|the open|open champ/i.test(h)) major = "The Open";
        cur = year && major ? { year, major, picks: [] } : null;
        if (cur) events.push(cur);
        continue;
      }
      if (cur && line.includes(":")) {
        const idx = line.indexOf(":");
        const member = line.slice(0, idx).trim();
        const golfers = line.slice(idx + 1).split(",").map((s) => s.trim()).filter(Boolean);
        if (member && golfers.length) cur.picks.push({ member, golfers });
      }
    }
    return events;
  };

  const handleBulkImport = () => {
    const events = parseBulkEvents(bulkText);
    if (!events.length) {
      toast({ title: "Nothing to import", description: "Start each event with '# Major Year' (e.g. '# Masters 2024').", variant: "destructive" });
      return;
    }
    setBulkBusy(true);
    setBulkResult(null);
    fetch("/api/admin/import-historical", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events, password }),
    })
      .then(async (r) => {
        if (r.status === 401) { onAuthFail(); return; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { toast({ title: "Bulk import failed", description: d.error || "", variant: "destructive" }); return; }
        setBulkResult(d.results || []);
        const ok = (d.results || []).filter((x: { ok: boolean }) => x.ok).length;
        toast({ title: `Imported ${ok}/${(d.results || []).length} events` });
        refetchTournaments();
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }))
      .finally(() => setBulkBusy(false));
  };

  return (
<Card className="bg-card border-card-border shadow-lg">
            <CardHeader className="bg-black/20 border-b border-border">
              <CardTitle className="text-xl uppercase tracking-wider text-primary">Import Past Event</CardTitle>
              <CardDescription>Backfill a completed major from ESPN's final scores + the picks. Scores come from ESPN; paste one line per member.</CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input value={importYear} onChange={e => setImportYear(e.target.value)} className="w-24" placeholder="2026" />
                </div>
                <div className="space-y-2">
                  <Label>Major</Label>
                  <Select value={importMajor} onValueChange={setImportMajor}>
                    <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Masters">Masters</SelectItem>
                      <SelectItem value="PGA Championship">PGA Championship</SelectItem>
                      <SelectItem value="U.S. Open">U.S. Open</SelectItem>
                      <SelectItem value="The Open">The Open (British)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleImportHistorical} disabled={importBusy} className="uppercase font-bold tracking-wider">
                  {importBusy ? "Importing…" : "Import"}
                </Button>
              </div>
              <div className="space-y-2">
                <Label>Picks — one line per member (<span className="font-mono text-xs">Name: golfer1, golfer2, …</span>)</Label>
                <textarea
                  value={importPicks}
                  onChange={e => setImportPicks(e.target.value)}
                  rows={6}
                  placeholder={"Hof: Rory McIlroy, Sam Burns, Cameron Young, Viktor Hovland, Sepp Straka, Alex Noren\nMullin: Bryson DeChambeau, Matt Fitzpatrick, ..."}
                  className="w-full bg-input border border-border rounded-md p-2 text-sm font-mono"
                />
              </div>
              {importResult && (
                <div className="text-sm space-y-1 border-t border-border pt-3">
                  <div className="font-bold text-primary">{importResult.name} — {importResult.golfers} golfers imported</div>
                  {importResult.members.map((m) => (
                    <div key={m.name} className="flex flex-wrap justify-between gap-2">
                      <span>{m.name}: {m.matched}/6 matched</span>
                      {m.unmatched.length > 0 && <span className="text-yellow-500 text-xs">unmatched: {m.unmatched.join(", ")}</span>}
                    </div>
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">View it from the scoreboard's tournament dropdown.</p>
                </div>
              )}

              <div className="space-y-2 border-t border-border pt-4">
                <Label>Bulk import — paste many events; start each with <span className="font-mono text-xs"># Major Year</span></Label>
                <textarea
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  rows={10}
                  placeholder={"# Masters 2024\nMullin: Scottie Scheffler, ...\nConway: ...\n\n# PGA Championship 2024\nMullin: ..."}
                  className="w-full bg-input border border-border rounded-md p-2 text-sm font-mono"
                />
                <Button onClick={handleBulkImport} disabled={bulkBusy} className="uppercase font-bold tracking-wider">
                  {bulkBusy ? "Importing…" : "Import all events"}
                </Button>
                {bulkResult && (
                  <div className="text-sm space-y-1 pt-2">
                    {bulkResult.map((r, i) => (
                      <div key={i}>
                        {r.ok ? (
                          <span><span className="text-primary font-bold">✓ {r.name}</span> — {(r.members || []).length} teams{(r.members || []).some(m => m.unmatched.length) ? ` · unmatched: ${(r.members || []).flatMap(m => m.unmatched).join(", ")}` : ""}</span>
                        ) : (
                          <span className="text-yellow-500">✗ {r.major} {r.year}: {r.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
  );
}
