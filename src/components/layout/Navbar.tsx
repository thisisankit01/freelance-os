"use client";

import { motion } from "framer-motion";
import { UserButton } from "@clerk/nextjs";
import { useTimerStore } from "@/lib/timer-store";
import { useEffect } from "react";

export function Navbar() {
  const { activeEntry, elapsed, isRunning, syncWithServer, stopTimer } =
    useTimerStore();

  useEffect(() => {
    syncWithServer();
    const interval = setInterval(syncWithServer, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") syncWithServer();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncWithServer]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  async function handleStop() {
    if (!activeEntry) return;
    const res = await fetch("/api/time-entries", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: activeEntry.id,
        ended_at: new Date().toISOString(),
      }),
    });
    if (res.ok) {
      stopTimer();
      window.dispatchEvent(new Event("freelanceos:time-refresh"));
    }
  }

  return (
    <motion.header
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="fixed px-2 top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl"
    >
      <div className="flex items-center justify-between px-4 py-2.5 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-xl border border-zinc-200/70 dark:border-zinc-700/70 rounded-2xl shadow-sm shadow-zinc-200/50 dark:shadow-zinc-900/50">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              aria-hidden="true"
            >
              <circle cx="7" cy="7" r="2.5" fill="white" />
              <path
                d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <span
            className="text-sm font-semibold cursor-pointer transition-colors text-zinc-800 dark:text-zinc-200 tracking-tight"
            onClick={() => window.location.reload()}
          >
            FreelanceOS
          </span>
        </div>

        {/* Center: Running Timer */}
        {isRunning && activeEntry && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="hidden sm:flex items-center gap-3 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-800 rounded-xl px-3 py-1.5"
          >
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-violet-500"></span>
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] font-medium text-violet-700 dark:text-violet-300 leading-none truncate max-w-[120px]">
                  {activeEntry.tasks?.title || "Tracking"}
                </span>
                <span className="text-xs font-mono font-bold text-violet-800 dark:text-violet-200 leading-tight">
                  {formatDuration(elapsed)}
                </span>
              </div>
            </div>
            <button
              onClick={handleStop}
              className="bg-white dark:bg-zinc-800 border border-violet-200 dark:border-violet-700 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-[10px] px-2.5 py-1 rounded-lg font-medium transition-colors"
            >
              ⏹ Stop
            </button>
          </motion.div>
        )}

        {/* Right side */}
        <div className="flex items-center gap-3">
          {isRunning && activeEntry && (
            <div className="sm:hidden flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
              </span>
              <button
                onClick={handleStop}
                className="bg-violet-600 text-white text-[10px] px-2.5 py-1 rounded-lg font-medium"
              >
                ⏹
              </button>
            </div>
          )}
          <UserButton
            appearance={{
              elements: {
                avatarBox: "w-7 h-7 rounded-xl",
                userButtonPopoverCard:
                  "rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700",
              },
            }}
          />
        </div>
      </div>
    </motion.header>
  );
}
