"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type TeamMember = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  payout_rate: number | null;
  payout_type: string | null;
  status: string | null;
};

export function TeamTable() {
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/team-members");
    const json = await res.json().catch(() => ({}));
    setTeam(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:team-refresh", onRefresh);
    return () => window.removeEventListener("soloos:team-refresh", onRefresh);
  }, []);

  if (loading) return <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-6">Loading team...</div>;

  return (
    <motion.div layoutId="TeamTable" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Team & Subcontractors</p>
        <p className="text-xs text-zinc-400">People you assign work and payouts to</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {team.map((m) => (
          <div key={m.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{m.name}</p>
              <p className="text-xs text-zinc-400">{m.role || "Team member"}{m.email ? ` · ${m.email}` : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.status || "active"}</p>
              <p className="text-xs text-zinc-400">{m.payout_rate ? `₹${m.payout_rate}/${m.payout_type || "fixed"}` : "No rate"}</p>
            </div>
          </div>
        ))}
        {team.length === 0 && <p className="text-sm text-zinc-400 p-5">No team yet. Say &quot;add team member Aman designer&quot;.</p>}
      </div>
    </motion.div>
  );
}
