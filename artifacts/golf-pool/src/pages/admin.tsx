import React, { useState } from "react";
import { Link } from "wouter";
import { useGetTournaments, useGetPoolMembers } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { TournamentsCard } from "@/components/admin/TournamentsCard";
import { TiersCard } from "@/components/admin/TiersCard";
import { ImportCard } from "@/components/admin/ImportCard";
import { MembersCard } from "@/components/admin/MembersCard";
import { PicksCard } from "@/components/admin/PicksCard";
import type { TournamentLite } from "@/components/admin/utils";

// Thin shell: auth + the two shared queries. Each feature lives in its own
// card component under components/admin/ (state and handlers co-located), so
// hooks stay unconditional and edits to one card can't break another.
export default function Admin() {
  const [password, setPassword] = useState(localStorage.getItem("admin_password") || "");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const { data: tournaments, refetch: refetchTournaments } = useGetTournaments();
  const { data: poolMembers, refetch: refetchMembers } = useGetPoolMembers();
  const tournamentList = tournaments as TournamentLite[] | undefined;
  const activeTournament = tournamentList?.find((t) => t.isActive);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Wrong password", description: "Check your password and try again.", variant: "destructive" });
        return;
      }
      localStorage.setItem("admin_password", password);
      setIsAuthenticated(true);
    } catch {
      toast({ title: "Could not reach server", variant: "destructive" });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("admin_password");
    setIsAuthenticated(false);
  };

  const handle401 = () => {
    handleLogout();
    toast({ title: "Session expired", description: "Password may have changed. Please log in again.", variant: "destructive" });
  };

  const handleExport = async () => {
    try {
      const res = await fetch("/api/admin/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        toast({ title: "Backup failed", description: "Could not export data.", variant: "destructive" });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `golf-pool-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Backup downloaded" });
    } catch {
      toast({ title: "Backup failed", description: "Could not reach server.", variant: "destructive" });
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
        <div className="max-w-md w-full bg-card p-8 rounded-xl border border-border shadow-2xl space-y-6">
          <h1 className="text-2xl font-bold text-primary uppercase tracking-wider text-center">Admin Access</h1>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                className="w-full bg-background border-input"
              />
            </div>
            <Button type="submit" disabled={isVerifying} className="w-full uppercase tracking-wider font-bold">
              {isVerifying ? "Checking…" : "Login"}
            </Button>
          </form>
          <div className="text-center">
            <Link href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors">
              &larr; Back to Scoreboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-4 md:p-8 pb-24 font-sans">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-6">
          <h1 className="text-3xl font-bold text-primary uppercase tracking-widest">Tournament Admin</h1>
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={handleExport} className="border-border">Backup</Button>
            <Button variant="outline" onClick={handleLogout} className="border-border">Logout</Button>
            <Link href="/" className="text-muted-foreground hover:text-primary uppercase tracking-widest font-bold text-sm">
              Scoreboard &rarr;
            </Link>
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <TournamentsCard
            password={password}
            onAuthFail={handle401}
            tournaments={tournamentList}
            activeTournament={activeTournament}
            refetchTournaments={refetchTournaments}
          />

          <TiersCard password={password} onAuthFail={handle401} tournaments={tournamentList} />

          <ImportCard password={password} onAuthFail={handle401} refetchTournaments={refetchTournaments} />

          <div className="space-y-8">
            <MembersCard
              password={password}
              onAuthFail={handle401}
              activeTournament={activeTournament}
              refetchMembers={refetchMembers}
            />

            <PicksCard
              password={password}
              onAuthFail={handle401}
              tournaments={tournamentList}
              poolMembers={poolMembers}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
