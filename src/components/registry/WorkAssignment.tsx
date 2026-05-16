"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Assignment = {
  id: string;
  title: string | null;
  status: string | null;
  due_date: string | null;
  team_members?: { name: string } | null;
  tasks?: { title: string } | null;
  projects?: { title: string } | null;
};

export function WorkAssignment() {
  const [items, setItems] = useState<Assignment[]>([]);

  async function load() {
    const res = await fetch("/api/work-assignments");
    const json = await res.json().catch(() => ({}));
    setItems(json.data || []);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:assignments-refresh", onRefresh);
    return () => window.removeEventListener("soloos:assignments-refresh", onRefresh);
  }, []);

  return (
    <motion.div layoutId="WorkAssignment" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Work Assignments</p>
        <p className="text-xs text-zinc-400">Assigned project and task work</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {items.map((a) => (
          <div key={a.id} className="px-5 py-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{a.title || a.tasks?.title || "Assignment"}</p>
            <p className="text-xs text-zinc-400">{a.team_members?.name || "Unassigned"}{a.projects?.title ? ` · ${a.projects.title}` : ""}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-sm text-zinc-400 p-5">No assignments yet. Say &quot;assign homepage task to Aman&quot;.</p>}
      </div>
    </motion.div>
  );
}
