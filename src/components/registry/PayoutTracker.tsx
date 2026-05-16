"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type Payout = {
  id: string;
  amount: number;
  status: string | null;
  due_date: string | null;
  notes: string | null;
  team_members?: { name: string } | null;
  projects?: { title: string } | null;
};

export function PayoutTracker() {
  const [payouts, setPayouts] = useState<Payout[]>([]);

  async function load() {
    const res = await fetch("/api/payouts");
    const json = await res.json().catch(() => ({}));
    setPayouts(json.data || []);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:payouts-refresh", onRefresh);
    return () => window.removeEventListener("soloos:payouts-refresh", onRefresh);
  }, []);

  const owed = useMemo(() => payouts.filter((p) => p.status !== "paid").reduce((sum, p) => sum + Number(p.amount || 0), 0), [payouts]);

  return (
    <motion.div layoutId="PayoutTracker" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Payouts</p>
          <p className="text-xs text-zinc-400">What you owe your team</p>
        </div>
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">₹{owed.toLocaleString("en-IN")}</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {payouts.map((p) => (
          <div key={p.id} className="px-5 py-3 flex justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{p.team_members?.name || "Team member"}</p>
              <p className="text-xs text-zinc-400">{p.projects?.title || p.notes || "Payout"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">₹{p.amount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-zinc-400">{p.status || "owed"}</p>
            </div>
          </div>
        ))}
        {payouts.length === 0 && <p className="text-sm text-zinc-400 p-5">No payouts yet. Say &quot;add payout Aman 5000&quot;.</p>}
      </div>
    </motion.div>
  );
}
