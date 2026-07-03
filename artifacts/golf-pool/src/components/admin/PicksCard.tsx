import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiErr, isUnauth, type TournamentLite } from "./utils";
import { useQuery } from "@tanstack/react-query";
import { useGetTournamentField, useSavePicks } from "@workspace/api-client-react";

export function PicksCard({ password, onAuthFail, tournaments, poolMembers }: { password: string; onAuthFail: () => void; tournaments: TournamentLite[] | undefined; poolMembers: { id: string; name: string }[] | undefined }) {
  const { toast } = useToast();
  const savePicks = useSavePicks();

  const [pickTourneyId, setPickTourneyId] = useState("");
  const [pickMemberId, setPickMemberId] = useState("");

  const selectedTourneyEspnId = tournaments?.find(t => t.id === pickTourneyId)?.espnEventId;

  const { data: field } = useGetTournamentField({ espnEventId: selectedTourneyEspnId || "" }, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { enabled: !!selectedTourneyEspnId } as any,
  });

  // Manual fetch (not the generated hook) because this endpoint now requires the
  // admin password via header — pick contents are masked from the public.
  const { data: existingPicks, refetch: refetchPicks } = useQuery<{ id: string }[]>({
    queryKey: ["memberPicks", pickTourneyId, pickMemberId],
    queryFn: async () => {
      const r = await fetch(`/api/admin/picks/${pickTourneyId}/${pickMemberId}`, {
        headers: { "X-Admin-Password": password },
      });
      return r.ok ? r.json() : [];
    },
    enabled: !!pickTourneyId && !!pickMemberId,
  });

  const [selectedGolfers, setSelectedGolfers] = useState<string[]>([]);
  const [pickTiers, setPickTiers] = useState<{ golferId: string; name: string; tier: number; odds: number | null }[]>([]);
  const tieredMode = pickTiers.length > 0;
  const [pickSlots, setPickSlots] = useState<{ [k: string]: string }>({ t1: "", t2: "", t3: "", t4: "", t5: "", extra: "" });

  // Load the selected tournament's tiers — its presence switches to tiered picks
  React.useEffect(() => {
    if (!pickTourneyId) { setPickTiers([]); return; }
    fetch(`/api/admin/tiers?tournamentId=${pickTourneyId}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => setPickTiers(Array.isArray(rows) ? rows : []))
      .catch(() => setPickTiers([]));
  }, [pickTourneyId]);

  // Populate selections when picks (or tiers) change
  React.useEffect(() => {
    if (!existingPicks) {
      setSelectedGolfers([]);
      setPickSlots({ t1: "", t2: "", t3: "", t4: "", t5: "", extra: "" });
      return;
    }
    setSelectedGolfers((existingPicks as { id: string }[]).map((p) => p.id));
    if (pickTiers.length) {
      const tierOf = new Map(pickTiers.map((g) => [g.golferId, g.tier]));
      const slots: { [k: string]: string } = { t1: "", t2: "", t3: "", t4: "", t5: "", extra: "" };
      for (const p of existingPicks as { id: string }[]) {
        const t = tierOf.get(p.id);
        if (t === 1) slots.t1 = p.id;
        else if (t === 2) slots.t2 = p.id;
        else if (t === 3) slots.t3 = p.id;
        else if (t === 4) { if (!slots.t4) slots.t4 = p.id; else slots.extra = p.id; }
        else if (t === 5) { if (!slots.t5) slots.t5 = p.id; else slots.extra = p.id; }
      }
      setPickSlots(slots);
    }
  }, [existingPicks, pickTiers]);

  const setSlot = (slot: string, golferId: string) => setPickSlots((s) => ({ ...s, [slot]: golferId }));

  // Golfers eligible for a slot: in the slot's tier(s), not used by another slot,
  // sorted by odds best-first (favorites first; unpriced golfers last). This also
  // orders the combined T4+T5 "Extra" dropdown by odds across both tiers.
  const slotOptions = (tiers: number[], slotKey: string) => {
    const prob = (a: number | null) => (a == null ? -1 : a >= 0 ? 100 / (a + 100) : -a / (-a + 100));
    return pickTiers
      .filter((g) => tiers.includes(g.tier) && (pickSlots[slotKey] === g.golferId || !Object.values(pickSlots).includes(g.golferId)))
      .sort((a, b) => prob(b.odds) - prob(a.odds));
  };

  const handleSavePicks = () => {
    if (!pickTourneyId || !pickMemberId) return;
    const golferIds = tieredMode
      ? [pickSlots.t1, pickSlots.t2, pickSlots.t3, pickSlots.t4, pickSlots.t5, pickSlots.extra].filter(Boolean)
      : selectedGolfers;
    if (golferIds.length !== 6) {
      toast({ title: "Need 6 picks", description: tieredMode ? "Fill all 6 tier slots." : "Select exactly 6 golfers.", variant: "destructive" });
      return;
    }
    savePicks.mutate({
      data: { tournamentId: pickTourneyId, poolMemberId: pickMemberId, golferIds, password },
    }, {
      onSuccess: () => { toast({ title: "Picks Saved" }); refetchPicks(); },
      onError: (e: unknown) => {
        if (isUnauth(e)) { onAuthFail(); return; }
        toast({ title: "Error saving picks", description: apiErr(e), variant: "destructive" });
      },
    });
  };

  const toggleGolfer = (golferId: string) => {
    if (selectedGolfers.includes(golferId)) {
      setSelectedGolfers(selectedGolfers.filter(id => id !== golferId));
    } else {
      if (selectedGolfers.length >= 6) {
        toast({ title: "Limit Reached", description: "You can only select 6 golfers per team", variant: "destructive" });
        return;
      }
      setSelectedGolfers([...selectedGolfers, golferId]);
    }
  };

  return (
<Card className="bg-card border-card-border shadow-lg">
              <CardHeader className="bg-black/20 border-b border-border">
                <CardTitle className="text-xl uppercase tracking-wider text-primary">Draft Picks</CardTitle>
                <CardDescription>Select 6 golfers per team</CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Tournament</Label>
                    <Select value={pickTourneyId} onValueChange={setPickTourneyId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select tournament" />
                      </SelectTrigger>
                      <SelectContent>
                        {tournaments?.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.name} {t.year}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Pool Member</Label>
                    <Select value={pickMemberId} onValueChange={setPickMemberId}>
                      <SelectTrigger className="bg-background border-border">
                        <SelectValue placeholder="Select member" />
                      </SelectTrigger>
                      <SelectContent>
                        {poolMembers?.map(m => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {pickTourneyId && pickMemberId && (
                  <div className="space-y-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold uppercase text-sm text-muted-foreground">
                        {tieredMode ? "Tiered Picks — 1 per tier + 1 extra (T4/T5)" : `Selected Golfers (${selectedGolfers.length}/6)`}
                      </h3>
                      <Button size="sm" onClick={handleSavePicks} disabled={savePicks.isPending} className="uppercase tracking-wider font-bold">
                        {savePicks.isPending ? "Saving..." : "Save Picks"}
                      </Button>
                    </div>

                    {tieredMode ? (
                      <div className="space-y-2">
                        {([
                          ["t1", "T1", [1]],
                          ["t2", "T2", [2]],
                          ["t3", "T3", [3]],
                          ["t4", "T4", [4]],
                          ["t5", "T5", [5]],
                          ["extra", "Extra (T4/T5)", [4, 5]],
                        ] as [string, string, number[]][]).map(([slot, label, tiers]) => (
                          <div key={slot} className="flex items-center gap-3">
                            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">{label}</span>
                            <Select value={pickSlots[slot] || ""} onValueChange={(v) => setSlot(slot, v)}>
                              <SelectTrigger className="flex-1"><SelectValue placeholder={`Pick ${label}`} /></SelectTrigger>
                              <SelectContent>
                                {slotOptions(tiers, slot).map((g) => (<SelectItem key={g.golferId} value={g.golferId}>{g.name}{g.odds != null ? ` · ${g.odds > 0 ? "+" : ""}${g.odds}` : ""}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="max-h-64 overflow-y-auto border border-border rounded-md bg-background p-2 grid grid-cols-1 gap-1">
                        {field?.map(golfer => {
                          const isSelected = selectedGolfers.includes(golfer.id);
                          return (
                            <div
                              key={golfer.id}
                              onClick={() => toggleGolfer(golfer.id)}
                              className={`p-2 rounded cursor-pointer flex justify-between items-center transition-colors ${isSelected ? 'bg-primary/20 border border-primary/50' : 'hover:bg-white/5 border border-transparent'}`}
                            >
                              <span className={isSelected ? "font-bold text-primary" : ""}>{golfer.name}</span>
                              {isSelected && <Badge className="bg-primary">Selected</Badge>}
                            </div>
                          );
                        })}
                        {(!field || field.length === 0) && (
                          <div className="p-4 text-center text-muted-foreground text-sm">
                            Field data not loaded. Make sure the ESPN ID is correct.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
  );
}
