import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiErr, isUnauth, type TournamentLite } from "./utils";

export function MembersCard({ password, onAuthFail, activeTournament, refetchMembers }: { password: string; onAuthFail: () => void; activeTournament: TournamentLite | undefined; refetchMembers: () => void }) {
  const { toast } = useToast();
  const [newMember, setNewMember] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [adminMembers, setAdminMembers] = useState<{ id: string; name: string; email: string | null; accessToken: string; submitted: boolean; pickCount: number }[]>([]);
  const [emailDraft, setEmailDraft] = useState<{ [id: string]: string }>({});

  const [nudging, setNudging] = useState(false);

  const loadAdminMembers = React.useCallback(() => {
    if (!password) return;
    fetch("/api/admin/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, tournamentId: activeTournament?.id }),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        if (Array.isArray(rows)) {
          setAdminMembers(rows);
          setEmailDraft(Object.fromEntries(rows.map((m: { id: string; email: string | null }) => [m.id, m.email || ""])));
        }
      })
      .catch(() => {});
  }, [password, activeTournament?.id]);

  React.useEffect(() => {
    loadAdminMembers(); // card only renders once authenticated
  }, [loadAdminMembers]);

  const handleCreateMember = () => {
    if (!newMember) return;
    fetch("/api/admin/pool-member", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newMember, email: newMemberEmail || undefined, password }),
    })
      .then(async (r) => {
        if (r.status === 401) { onAuthFail(); return; }
        if (!r.ok) { toast({ title: "Error adding member", variant: "destructive" }); return; }
        toast({ title: "Member Added" });
        refetchMembers();
        loadAdminMembers();
        setNewMember("");
        setNewMemberEmail("");
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }));
  };

  const saveMemberEmail = (id: string) => {
    fetch(`/api/admin/pool-member/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: emailDraft[id] ?? "", password }),
    })
      .then((r) => {
        if (r.status === 401) { onAuthFail(); return; }
        if (r.ok) { toast({ title: "Email saved" }); loadAdminMembers(); }
        else toast({ title: "Couldn't save email", variant: "destructive" });
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }));
  };

  const copyMyLink = (token: string) => {
    const url = `${window.location.origin}/me/${token}`;
    navigator.clipboard?.writeText(url).then(
      () => toast({ title: "Link copied", description: url }),
      () => toast({ title: "Copy this link", description: url }),
    );
  };

  const clearPicks = (memberId: string, name: string) => {
    if (!activeTournament) { toast({ title: "No active tournament", variant: "destructive" }); return; }
    if (!window.confirm(`Clear ${name}'s picks for ${activeTournament.name}? This deletes their selections and submission for this event.`)) return;
    fetch("/api/admin/clear-picks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, tournamentId: activeTournament.id, poolMemberId: memberId }),
    })
      .then((r) => {
        if (r.status === 401) { onAuthFail(); return; }
        if (r.ok) { toast({ title: "Picks cleared", description: `${name} can pick again` }); loadAdminMembers(); }
        else toast({ title: "Couldn't clear picks", variant: "destructive" });
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }));
  };

  const sendReminders = () => {
    setNudging(true);
    fetch("/api/admin/send-reminders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, baseUrl: window.location.origin }),
    })
      .then(async (r) => {
        if (r.status === 401) { onAuthFail(); return; }
        const d = await r.json().catch(() => ({}));
        if (!r.ok || d.ok === false) {
          toast({ title: "No reminders sent", description: d.reason || "Failed", variant: "destructive" });
          return;
        }
        toast({ title: `Reminders sent: ${d.sent}`, description: `${d.alreadySubmitted} already in · ${d.skippedNoEmail} have no email on file` });
      })
      .catch(() => toast({ title: "Could not reach server", variant: "destructive" }))
      .finally(() => setNudging(false));
  };

  return (
<Card className="bg-card border-card-border shadow-lg">
              <CardHeader className="bg-black/20 border-b border-border">
                <CardTitle className="text-xl uppercase tracking-wider text-primary">Pool Members</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="space-y-2 flex-1 min-w-[140px]">
                    <Label>Name</Label>
                    <Input value={newMember} onChange={e => setNewMember(e.target.value)} placeholder="e.g. John Doe" />
                  </div>
                  <div className="space-y-2 flex-1 min-w-[180px]">
                    <Label>Email (for their pick link)</Label>
                    <Input value={newMemberEmail} onChange={e => setNewMemberEmail(e.target.value)} placeholder="john@example.com" />
                  </div>
                  <Button onClick={handleCreateMember} disabled={!newMember} className="uppercase font-bold tracking-wider">Add</Button>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold uppercase text-sm text-muted-foreground">Members</h3>
                    <div className="flex items-center gap-3">
                      {activeTournament && adminMembers.length > 0 && (
                        <span className="text-xs text-muted-foreground">Submitted: {adminMembers.filter(m => m.submitted).length}/{adminMembers.length}</span>
                      )}
                      <Button size="sm" variant="outline" onClick={sendReminders} disabled={nudging} className="h-7 text-xs uppercase tracking-wider">
                        {nudging ? "Sending…" : "Nudge now"}
                      </Button>
                    </div>
                  </div>
                  {adminMembers.length === 0 && <span className="text-sm text-muted-foreground">No members added yet</span>}
                  {adminMembers.map(m => (
                    <div key={m.id} className="p-3 bg-background rounded-md border border-border space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{m.name}</span>
                        {activeTournament && (
                          m.submitted
                            ? <span className="text-[10px] rounded bg-primary px-2 py-0.5 text-primary-foreground uppercase tracking-wider">Submitted ✓</span>
                            : <span className="text-[10px] rounded bg-yellow-500/20 text-yellow-500 px-2 py-0.5 uppercase tracking-wider">Not yet ✗</span>
                        )}
                      </div>
                      <div className="text-xs">
                        <span className="text-muted-foreground">Email on file: </span>
                        {m.email
                          ? <span className="font-mono">{m.email}</span>
                          : <span className="text-yellow-500">none</span>}
                      </div>
                      <div className="flex gap-2 items-center">
                        <Input
                          value={emailDraft[m.id] ?? (m.email || "")}
                          onChange={e => setEmailDraft({ ...emailDraft, [m.id]: e.target.value })}
                          onKeyDown={e => { if (e.key === "Enter") saveMemberEmail(m.id); }}
                          placeholder="email@example.com"
                          className="h-8 text-sm"
                        />
                        <Button size="sm" variant="outline" onClick={() => saveMemberEmail(m.id)} className="h-8 text-xs uppercase tracking-wider">Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => copyMyLink(m.accessToken)} className="h-8 text-xs uppercase tracking-wider text-muted-foreground hover:text-primary whitespace-nowrap">Copy link</Button>
                      </div>
                      {activeTournament && (m.submitted || m.pickCount > 0) && (
                        <div className="flex items-center justify-between gap-2 pt-1">
                          <span className="text-xs text-muted-foreground">{m.pickCount} pick{m.pickCount === 1 ? "" : "s"}{m.submitted ? " · submitted" : " · draft"}</span>
                          <Button size="sm" variant="ghost" onClick={() => clearPicks(m.id, m.name)} className="h-7 text-xs text-red-400 hover:text-red-300 uppercase tracking-wider">Clear picks</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
  );
}
