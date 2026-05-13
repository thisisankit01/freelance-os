"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import { useStore } from "@/lib/store";
import { motion } from "framer-motion";

type Props = {
  /**
   * 'default'  → only show if Google Calendar is NOT connected.
   *                Hides automatically once connected so it never annoys.
   * 'calendar' → always show when rendered inside calendar/appointment views
   *                (so user can sync while managing meetings).
   */
  context?: "default" | "calendar";
};

export function ConnectGoogleCalendar({ context = "default" }: Props) {
  const { getToken } = useAuth();
  const { setComponents } = useStore();
  const [connected, setConnected] = useState<boolean | null>(null); // null = checking
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Auto-check on mount
  useEffect(() => {
    getToken({ template: "google" })
      .then((token) => setConnected(!!token))
      .catch(() => setConnected(false));
  }, [getToken]);

  async function syncCalendar() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/google/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) {
        setSyncMsg(`Error: ${data.error}`);
        return;
      }
      const count = data.synced ?? 0;
      const matched = data.totalMatched ?? 0;
      const removed = data.markedCancelled ?? 0;
      const parts: string[] = [];
      if (count > 0)
        parts.push(`${count} new event${count > 1 ? "s" : ""} synced`);
      if (removed > 0)
        parts.push(`${removed} cancelled in Google cleared here`);
      if (parts.length > 0) {
        setSyncMsg(`✓ ${parts.join(" · ")}`);
      } else if (matched > 0) {
        setSyncMsg(
          `Already up to date (${matched} active event${matched > 1 ? "s" : ""})`,
        );
      } else {
        setSyncMsg("No matching events found");
      }
      setComponents(["BookingCalendar"]);
      window.dispatchEvent(new Event("freelanceos:appointments"));
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  }

  // SMART VISIBILITY:
  // If connected and we're not in an explicit calendar context → hide completely
  if (connected === true && context === "default") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 text-lg flex-shrink-0">
            📅
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
              Google Calendar
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {syncMsg
                ? syncMsg
                : connected === null
                  ? "Checking…"
                  : connected
                    ? "Connected — sync to pull events"
                    : "Sign in with Google to connect"}
            </p>
          </div>
        </div>
        <button
          onClick={syncCalendar}
          disabled={syncing || connected === false}
          className="text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0"
        >
          {syncing ? "Syncing…" : "Sync Now"}
        </button>
      </div>
    </motion.div>
  );
}
