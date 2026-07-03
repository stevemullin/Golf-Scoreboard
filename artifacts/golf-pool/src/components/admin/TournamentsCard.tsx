import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiErr, isUnauth, type TournamentLite } from "./utils";
import { useQueryClient } from "@tanstack/react-query";
import { useCreateTournament, useActivateTournament, useForceRefresh, getGetTournamentFieldQueryKey } from "@workspace/api-client-react";

export function TournamentsCard({ password, onAuthFail, tournaments, activeTournament, refetchTournaments }: { password: string; onAuthFail: () => void; tournaments: TournamentLite[] | undefined; activeTournament: TournamentLite | undefined; refetchTournaments: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createTournament = useCreateTournament();
  const activateTournament = useActivateTournament();
  const forceRefresh = useForceRefresh();

  const [newTourney, setNewTourney] = useState({ name: "", year: new Date().getFullYear(), espnId: "", cutSize: "" });
  const [pgaEvents, setPgaEvents] = useState<{ espnEventId: string; name: string; date: string; state: string | null }[]>([]);

  React.useEffect(() => {
    fetch("/api/admin/events")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPgaEvents(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []); // card only renders once authenticated

  const [lockDraft, setLockDraft] = useState<{ [id: string]: string }>({});

  const [editingEspnId, setEditingEspnId] = useState<string | null>(null);
  const [editingEspnValue, setEditingEspnValue] = useState("");
  const [editNameValue, setEditNameValue] = useState("");
  const [editYearValue, setEditYearValue] = useState("");

  const handleSetCutSize = async (tournamentId: string, value: string) => {
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}/cut-size`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cutSize: value === "off" ? null : parseInt(value), password }),
      });
      if (!res.ok) {
        if (res.status === 401) { onAuthFail(); return; }
        toast({ title: "Could not update cut", variant: "destructive" });
        return;
      }
      toast({ title: "Cut updated" });
      refetchTournaments();
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    }
  };

  const handleCreateTournament = () => {
    createTournament.mutate({
      data: {
        name: newTourney.name,
        year: newTourney.year,
        espnEventId: newTourney.espnId,
        cutSize: newTourney.cutSize ? parseInt(newTourney.cutSize) : null,
        password
      } as any
    }, {
      onSuccess: () => {
        toast({ title: "Tournament Created" });
        refetchTournaments();
        setNewTourney({ name: "", year: new Date().getFullYear(), espnId: "", cutSize: "" });
      },
      onError: (e: unknown) => {
        if (isUnauth(e)) { onAuthFail(); return; }
        toast({ title: "Error creating tournament", description: apiErr(e), variant: "destructive" });
      }
    });
  };

  const handleSaveEdit = async (tournamentId: string) => {
    const body: { password: string; name?: string; year?: number; espnEventId?: string } = { password };
    if (editNameValue.trim()) body.name = editNameValue.trim();
    if (editYearValue.trim() && !isNaN(Number(editYearValue))) body.year = Number(editYearValue.trim());
    if (editingEspnValue.trim()) body.espnEventId = editingEspnValue.trim();
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.status === 401) { onAuthFail(); return; }
      if (!res.ok) {
        toast({ title: "Update failed", description: data.error || res.statusText, variant: "destructive" });
        return;
      }
      toast({ title: "Tournament updated" });
      setEditingEspnId(null);
      refetchTournaments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDeleteTournament = async (tournamentId: string, label: string) => {
    if (!window.confirm(`Delete "${label}" and ALL its data (picks, tiers, scores, submissions)? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/tournament/${tournamentId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.status === 401) { onAuthFail(); return; }
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast({ title: "Delete failed", description: d.error || res.statusText, variant: "destructive" });
        return;
      }
      toast({ title: "Tournament deleted" });
      refetchTournaments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ISO timestamp -> value for a <input type="datetime-local"> (local time)
  const toLocalInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    const d = new Date(iso);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  };

  const handleSetLock = (tournamentId: string, localValue: string) => {
    const iso = localValue ? new Date(localValue).toISOString() : null;
    fetch(`/api/admin/tournament/${tournamentId}/lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ picksLockAt: iso, password }),
    })
      .then((r) => {
        if (r.status === 401) { onAuthFail(); return; }
        if (r.ok) { toast({ title: "Pick deadline saved" }); refetchTournaments(); }
        else toast({ title: "Couldn't save deadline", variant: "destructive" });
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }));
  };

  const handleActivate = (id: string) => {
    activateTournament.mutate({
      tournamentId: id,
      data: { password }
    }, {
      onSuccess: () => {
        toast({ title: "Tournament Activated" });
        refetchTournaments();
      },
      onError: (e: unknown) => {
        if (isUnauth(e)) { onAuthFail(); return; }
        toast({ title: "Error activating tournament", description: apiErr(e), variant: "destructive" });
      }
    });
  };

  const handleForceRefresh = () => {
    if (!activeTournament) return;
    forceRefresh.mutate({
      data: { tournamentId: activeTournament.id, password }
    }, {
      onSuccess: () => toast({ title: "Refresh complete" }),
      onError: (e: unknown) => {
        if (isUnauth(e)) { onAuthFail(); return; }
        toast({ title: "Error refreshing", description: apiErr(e), variant: "destructive" });
      }
    });
  };

  return (
<Card className="bg-card border-card-border shadow-lg">
            <CardHeader className="bg-black/20 border-b border-border">
              <CardTitle className="text-xl uppercase tracking-wider text-primary">Tournaments</CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="space-y-4">
                <h3 className="font-bold uppercase text-sm text-muted-foreground">Create New</h3>
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <Label>Pick from PGA schedule (optional)</Label>
                    <Select onValueChange={(id) => {
                      const ev = pgaEvents.find((e) => e.espnEventId === id);
                      if (ev) setNewTourney((prev) => ({ ...prev, name: ev.name, year: parseInt(ev.date.slice(0, 4)) || new Date().getFullYear(), espnId: ev.espnEventId }));
                    }}>
                      <SelectTrigger><SelectValue placeholder={pgaEvents.length ? "Choose an event to autofill…" : "Loading PGA schedule…"} /></SelectTrigger>
                      <SelectContent>
                        {pgaEvents.map((e) => (
                          <SelectItem key={e.espnEventId} value={e.espnEventId}>
                            {e.name} — {e.date.slice(0, 10)}{e.state === "in" ? " (live)" : e.state === "post" ? " (done)" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tournament Name</Label>
                    <Input value={newTourney.name} onChange={e => setNewTourney({...newTourney, name: e.target.value})} placeholder="e.g. The Masters" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Year</Label>
                      <Input type="number" value={newTourney.year} onChange={e => setNewTourney({...newTourney, year: parseInt(e.target.value)})} />
                    </div>
                    <div className="space-y-2">
                      <Label>ESPN Event ID</Label>
                      <Input value={newTourney.espnId} onChange={e => setNewTourney({...newTourney, espnId: e.target.value})} placeholder="e.g. 401580342" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Cut indicator (optional)</Label>
                    <Select value={newTourney.cutSize || "off"} onValueChange={(v) => setNewTourney({ ...newTourney, cutSize: v === "off" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">Off (no cut indicator)</SelectItem>
                        <SelectItem value="50">Top 50 — Masters</SelectItem>
                        <SelectItem value="60">Top 60 — US Open</SelectItem>
                        <SelectItem value="70">Top 70 — PGA &amp; The Open</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={handleCreateTournament} disabled={createTournament.isPending || !newTourney.name || !newTourney.espnId} className="uppercase font-bold tracking-wider">
                    {createTournament.isPending ? "Creating..." : "Create Tournament"}
                  </Button>
                </div>
              </div>

              <div className="space-y-4 pt-6 border-t border-border">
                <h3 className="font-bold uppercase text-sm text-muted-foreground">Existing Tournaments</h3>
                <div className="space-y-2">
                  {tournaments?.map(t => (
                    <div key={t.id} className="p-3 bg-background rounded-md border border-border space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold">{t.name} {t.year}</div>
                          <div className="text-xs text-muted-foreground">ESPN ID: {t.espnEventId || <span className="text-yellow-500">not set</span>}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Select value={(t as any).cutSize != null ? String((t as any).cutSize) : "off"} onValueChange={(v) => handleSetCutSize(t.id, v)}>
                            <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="off">Cut: Off</SelectItem>
                              <SelectItem value="50">Top 50</SelectItem>
                              <SelectItem value="60">Top 60</SelectItem>
                              <SelectItem value="70">Top 70</SelectItem>
                            </SelectContent>
                          </Select>
                          {t.isActive ? (
                            <Badge className="bg-primary text-primary-foreground hover:bg-primary uppercase tracking-wider">Active</Badge>
                          ) : (
                            <Button size="sm" variant="outline" onClick={() => handleActivate(t.id)} disabled={activateTournament.isPending} className="uppercase text-xs tracking-wider">
                              Set Active
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => {
                            const open = editingEspnId === t.id ? null : t.id;
                            setEditingEspnId(open);
                            setEditingEspnValue(t.espnEventId || "");
                            setEditNameValue(t.name || "");
                            setEditYearValue(String(t.year || ""));
                          }} className="text-xs text-muted-foreground hover:text-primary px-2">
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteTournament(t.id, `${t.name} ${t.year}`)} className="text-xs text-red-400 hover:text-red-300 px-2">
                            Delete
                          </Button>
                        </div>
                      </div>
                      {editingEspnId === t.id && (
                        <div className="flex gap-2 pt-1 flex-wrap items-center">
                          <Input value={editNameValue} onChange={e => setEditNameValue(e.target.value)} placeholder="Name" className="h-8 text-sm bg-input border-border w-40" />
                          <Input value={editYearValue} onChange={e => setEditYearValue(e.target.value)} placeholder="Year" className="h-8 text-sm bg-input border-border w-20" />
                          <Input
                            value={editingEspnValue}
                            onChange={e => setEditingEspnValue(e.target.value)}
                            placeholder="ESPN Event ID"
                            className="h-8 text-sm bg-input border-border w-40"
                            onKeyDown={e => { if (e.key === "Enter") handleSaveEdit(t.id); if (e.key === "Escape") setEditingEspnId(null); }}
                          />
                          <Button size="sm" onClick={() => handleSaveEdit(t.id)} className="h-8 text-xs uppercase tracking-wider">
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingEspnId(null)} className="h-8 text-xs">
                            Cancel
                          </Button>
                        </div>
                      )}
                      <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">Picks lock</span>
                        <Input
                          type="datetime-local"
                          value={lockDraft[t.id] ?? toLocalInput((t as any).picksLockAt)}
                          onChange={e => setLockDraft({ ...lockDraft, [t.id]: e.target.value })}
                          className="h-8 text-xs bg-input border-border w-[220px]"
                        />
                        <Button size="sm" variant="outline" onClick={() => handleSetLock(t.id, lockDraft[t.id] ?? toLocalInput((t as any).picksLockAt))} className="h-8 text-xs uppercase tracking-wider">Save</Button>
                        {(t as any).picksLockAt && (
                          <Button size="sm" variant="ghost" onClick={() => { setLockDraft({ ...lockDraft, [t.id]: "" }); handleSetLock(t.id, ""); }} className="h-8 text-xs text-muted-foreground">Clear</Button>
                        )}
                      </div>
                    </div>
                  ))}
                  {tournaments?.length === 0 && (
                    <div className="text-sm text-muted-foreground text-center py-4">No tournaments found</div>
                  )}
                </div>
              </div>
              
              <div className="pt-6 border-t border-border">
                <Button 
                  variant="outline" 
                  className="w-full uppercase tracking-wider border-primary/50 text-primary hover:bg-primary/10" 
                  onClick={handleForceRefresh}
                  disabled={forceRefresh.isPending || !activeTournament}
                >
                  {forceRefresh.isPending ? "Refreshing..." : "Force ESPN Data Refresh"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2 text-center">Refreshes active tournament data immediately</p>
              </div>
            </CardContent>
          </Card>
  );
}
