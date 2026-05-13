"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import { format } from "date-fns";
import { useTimerStore } from "@/lib/timer-store";

export function TimeTracker() {
  const { user } = useUser();
  const [tasks, setTasks] = useState<
    {
      id: string;
      title: string;
      status: string;
      projects?: { id: string; title: string };
      estimated_hours?: number;
      due_date?: string;
    }[]
  >([]);
  const [entries, setEntries] = useState<
    {
      id: string;
      started_at: string;
      ended_at: string | null;
      duration_minutes: number | null;
      tasks?: { id: string; title: string };
      billable: boolean;
    }[]
  >([]);
  const [selectedTask, setSelectedTask] = useState("");
  const [description, setDescription] = useState("");

  const {
    activeEntry,
    elapsed,
    isRunning,
    startTimer,
    stopTimer,
    setActiveEntry,
  } = useTimerStore();

  useEffect(() => {
    if (user?.id) {
      loadTasks();
      loadEntries();
    }
  }, [user?.id]);

  useEffect(() => {
    const onRefresh = () => loadEntries();
    window.addEventListener("freelanceos:time-refresh", onRefresh);
    return () =>
      window.removeEventListener("freelanceos:time-refresh", onRefresh);
  }, []);

  async function loadTasks() {
    const res = await fetch("/api/tasks");
    const json = await res.json();
    setTasks(
      json.data?.filter((t: { status: string }) => t.status !== "done") || [],
    );
  }

  async function loadEntries() {
    const res = await fetch("/api/time-entries");
    const json = await res.json();
    setEntries(json.data || []);
    const active = json.data?.find(
      (e: { ended_at: string | null }) => !e.ended_at,
    );
    if (active) setActiveEntry(active);
  }

  async function handleStart() {
    if (!selectedTask) return;
    const res = await fetch("/api/time-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task_id: selectedTask,
        started_at: new Date().toISOString(),
        description,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setDescription("");
      setSelectedTask("");
      startTimer(data.data);
      loadEntries();
    }
  }

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
      loadEntries();
      loadTasks();
    }
  }

  function formatDuration(seconds: number) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }

  const todayTotal = entries
    .filter((e) => {
      const date = new Date(e.started_at);
      return (
        date.toDateString() === new Date().toDateString() && e.duration_minutes
      );
    })
    .reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

  const displayTodayTotal =
    todayTotal + (isRunning ? Math.floor(elapsed / 60) : 0);

  return (
    <motion.div
      layoutId="TimeTracker"
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Time Tracker
        </h2>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          Today:{" "}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">
            {Math.floor(displayTodayTotal / 60)}h {displayTodayTotal % 60}m
          </span>
        </div>
      </div>

      {isRunning && activeEntry ? (
        <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4 mb-4 text-center">
          <p className="text-xs text-violet-600 dark:text-violet-400 mb-1">
            Tracking
          </p>
          <p className="text-2xl font-mono font-bold text-violet-800 dark:text-violet-200">
            {formatDuration(elapsed)}
          </p>
          <p className="text-xs text-violet-500 dark:text-violet-400 mt-1">
            {activeEntry.tasks?.title}
          </p>
          <button
            onClick={handleStop}
            className="mt-3 bg-red-500 hover:bg-red-600 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors"
          >
            ⏹ Stop
          </button>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30"
          >
            <option value="">Select task...</option>
            {tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} {t.projects?.title ? `(${t.projects.title})` : ""}
              </option>
            ))}
          </select>
          <input
            placeholder="Note"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30"
          />
          <button
            onClick={handleStart}
            disabled={!selectedTask}
            className="bg-violet-600 hover:bg-violet-700 text-white text-sm px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ▶ Start
          </button>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">
          Recent entries
        </p>
        {entries.slice(0, 5).map((entry) => (
          <div
            key={entry.id}
            className="flex justify-between items-center py-2 border-b border-zinc-50 dark:border-zinc-800/50 text-sm"
          >
            <div>
              <p className="text-zinc-800 dark:text-zinc-200">
                {entry.tasks?.title}
              </p>
              <p className="text-[10px] text-zinc-400">
                {format(new Date(entry.started_at), "MMM d, h:mm a")}
                {entry.duration_minutes &&
                  ` · ${Math.floor(entry.duration_minutes / 60)}h ${entry.duration_minutes % 60}m`}
              </p>
            </div>
            {entry.billable && (
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-0.5 rounded-full font-medium">
                Billable
              </span>
            )}
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-zinc-400 text-center py-4">
            No time entries yet
          </p>
        )}
      </div>
    </motion.div>
  );
}
