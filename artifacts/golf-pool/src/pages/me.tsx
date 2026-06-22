import { useEffect, useState } from "react";
import { useRoute } from "wouter";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type Tier = { golferId: string; name: string; tier: number; odds: number | null };
type MeData = {
  member: { id: string; name: string };
  tournament: { id: string; name: string; year: number; picksLockAt: string | null; locked: boolean } | null;
  tiersBuilt?: boolean;
  tiers?: Tier[];
  picks?: string[];
  submitted?: boolean;
};

const SLOTS: [string, string, number[]][] = [
  ["t1", "T1", [1]],
  ["t2", "T2", [2]],
  ["t3", "T3", [3]],
  ["t4", "T4", [4]],
  ["t5", "T5", [5]],
  ["extra", "Extra (T4/T5)", [4, 5]],
];

const oddsLabel = (o: number | null) => (o == null ? "" : ` · ${o > 0 ? "+" : ""}${o}`);

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-4 md:p-8 font-sans">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

export default function Me() {
  const [, params] = useRoute("/me/:token");
  const token = params?.token ?? "";
  const { toast } = useToast();
  const [data, setData] = useState<MeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [slots, setSlots] = useState<{ [k: string]: string }>({ t1: "", t2: "", t3: "", t4: "", t5: "", extra: "" });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch(`/api/me/${token}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("bad"))))
      .then((d: MeData) => {
        setData(d);
        const tierOf = new Map((d.tiers || []).map((g) => [g.golferId, g.tier]));
        const s: { [k: string]: string } = { t1: "", t2: "", t3: "", t4: "", t5: "", extra: "" };
        for (const id of d.picks || []) {
          const t = tierOf.get(id);
          if (t === 1) s.t1 = id;
          else if (t === 2) s.t2 = id;
          else if (t === 3) s.t3 = id;
          else if (t === 4) { if (!s.t4) s.t4 = id; else s.extra = id; }
          else if (t === 5) { if (!s.t5) s.t5 = id; else s.extra = id; }
        }
        setSlots(s);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [token]);

  const tiers = data?.tiers || [];
  const nameOf = (id: string) => tiers.find((g) => g.golferId === id)?.name || id;
  const prob = (a: number | null) => (a == null ? -1 : a >= 0 ? 100 / (a + 100) : -a / (-a + 100));
  const slotOptions = (slotTiers: number[], slotKey: string) =>
    tiers
      .filter((g) => slotTiers.includes(g.tier) && (slots[slotKey] === g.golferId || !Object.values(slots).includes(g.golferId)))
      .sort((a, b) => prob(b.odds) - prob(a.odds));
  const setSlot = (k: string, v: string) => setSlots((s) => ({ ...s, [k]: v }));
  const filled = [slots.t1, slots.t2, slots.t3, slots.t4, slots.t5, slots.extra].filter(Boolean).length;

  const submit = () => {
    const golferIds = [slots.t1, slots.t2, slots.t3, slots.t4, slots.t5, slots.extra].filter(Boolean);
    if (golferIds.length !== 6) {
      toast({ title: "Fill all 6 slots", description: "Pick one golfer in each slot.", variant: "destructive" });
      return;
    }
    setSaving(true);
    fetch(`/api/me/${token}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ golferIds }),
    })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) {
          toast({ title: "Couldn't save", description: d?.error || "", variant: "destructive" });
          return;
        }
        toast({ title: "Picks submitted! 🎉" });
        load();
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }))
      .finally(() => setSaving(false));
  };

  if (loading) {
    return <Shell><p className="text-muted-foreground text-center py-12">Loading…</p></Shell>;
  }
  if (error || !data) {
    return (
      <Shell>
        <Card className="bg-card border-card-border">
          <CardHeader><CardTitle className="text-xl uppercase tracking-wider text-primary">Invalid link</CardTitle></CardHeader>
          <CardContent><p className="text-muted-foreground">This pick link isn't valid. Ask the pool admin for your personal link.</p></CardContent>
        </Card>
      </Shell>
    );
  }

  const lockStr = data.tournament?.picksLockAt ? new Date(data.tournament.picksLockAt).toLocaleString() : null;

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-2xl font-bold uppercase tracking-wider text-primary">Hi, {data.member.name}</h1>
        {data.tournament && <p className="text-muted-foreground">{data.tournament.name} {data.tournament.year}</p>}
      </div>

      {!data.tournament ? (
        <Card className="bg-card border-card-border">
          <CardContent className="py-8"><p className="text-muted-foreground">There's no active tournament right now. Check back when the pool opens.</p></CardContent>
        </Card>
      ) : !data.tiersBuilt ? (
        <Card className="bg-card border-card-border">
          <CardContent className="py-8"><p className="text-muted-foreground">Picks aren't open yet — the admin is still setting the golfer tiers. Check back soon.</p></CardContent>
        </Card>
      ) : data.tournament.locked ? (
        <Card className="bg-card border-card-border">
          <CardHeader>
            <CardTitle className="text-lg uppercase tracking-wider text-primary">Picks are locked</CardTitle>
            <CardDescription>{lockStr ? `Locked at ${lockStr}.` : "This event has started."} Contact the admin if you need a change.</CardDescription>
          </CardHeader>
          <CardContent>
            {filled > 0 ? (
              <div className="space-y-1">
                {SLOTS.map(([key, label]) => (
                  <div key={key} className="flex justify-between text-sm border-b border-border/40 py-1">
                    <span className="text-muted-foreground uppercase text-xs">{label}</span>
                    <span>{slots[key] ? nameOf(slots[key]!) : "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">You didn't submit picks for this event.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-card border-card-border shadow-lg">
          <CardHeader className="bg-black/20 border-b border-border">
            <CardTitle className="text-lg uppercase tracking-wider text-primary flex items-center justify-between">
              Your Picks
              {data.submitted && <span className="text-xs rounded bg-primary px-2 py-0.5 text-primary-foreground">Submitted ✓</span>}
            </CardTitle>
            <CardDescription>
              Pick one golfer per tier, plus a 6th from T4 or T5. {lockStr ? `You can edit until ${lockStr}.` : "Submit when ready."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-3">
            {SLOTS.map(([key, label, slotTiers]) => (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">{label}</span>
                <Select value={slots[key] || ""} onValueChange={(v) => setSlot(key, v)}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={`Pick ${label}`} /></SelectTrigger>
                  <SelectContent>
                    {slotOptions(slotTiers, key).map((g) => (
                      <SelectItem key={g.golferId} value={g.golferId}>{g.name}{oddsLabel(g.odds)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2">
              <span className="text-sm text-muted-foreground">{filled}/6 selected</span>
              <Button onClick={submit} disabled={saving || filled !== 6} className="uppercase font-bold tracking-wider">
                {saving ? "Saving…" : data.submitted ? "Update picks" : "Submit picks"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </Shell>
  );
}
