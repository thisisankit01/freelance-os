"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import { format } from "date-fns";

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
      ended_at: string;
      duration_minutes: number;
      tasks?: { id: string; title: string };
      billable: boolean;
    }[]
  >([]);
  const [activeEntry, setActiveEntry] = useState<{
    id: string;
    started_at: string;
    ended_at: string;
    duration_minutes: number;
    tasks?: { id: string; title: string };
    billable: boolean;
  } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [selectedTask, setSelectedTask] = useState("");
  const [description, setDescription] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadTasks();
      loadEntries();
    }
  }, [user?.id]);

  useEffect(() => {
    if (activeEntry) {
      intervalRef.current = setInterval(() => {
        const start = new Date(activeEntry.started_at).getTime();
        setElapsed(Math.floor((Date.now() - start) / 1000));
      }, 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setTimeout(() => {
        setElapsed(0);
      }, 0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeEntry]);

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

  async function startTimer() {
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
      setDescription("");
      loadEntries();
    }
  }

  async function stopTimer() {
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
      setActiveEntry(null);
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
    .filter((e: { started_at: string; duration_minutes: number }) => {
      const date = new Date(e.started_at);
      return (
        date.toDateString() === new Date().toDateString() && e.duration_minutes
      );
    })
    .reduce(
      (sum: number, e: { duration_minutes: number }) =>
        sum + (e.duration_minutes || 0),
      0,
    );

  return (
    <motion.div
      layoutId="TimeTracker"
      className="bg-white border border-zinc-100 rounded-xl p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">Time Tracker</h2>
        <div className="text-xs text-zinc-500">
          Today:{" "}
          <span className="font-medium text-zinc-800">
            {Math.floor(todayTotal / 60)}h {todayTotal % 60}m
          </span>
        </div>
      </div>

      {activeEntry ? (
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-4 mb-4 text-center">
          <p className="text-xs text-violet-600 mb-1">Tracking</p>
          <p className="text-2xl font-mono font-bold text-violet-800">
            {formatDuration(elapsed)}
          </p>
          <p className="text-xs text-violet-500 mt-1">
            {activeEntry.tasks?.title}
          </p>
          <button
            onClick={stopTimer}
            className="mt-3 bg-red-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-red-600"
          >
            ⏹ Stop
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mb-4">
          <select
            value={selectedTask}
            onChange={(e) => setSelectedTask(e.target.value)}
            className="flex-1 text-sm border rounded-lg px-3 py-2"
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
            className="flex-1 text-sm border rounded-lg px-3 py-2"
          />
          <button
            onClick={startTimer}
            disabled={!selectedTask}
            className="bg-emerald-500 text-white text-sm px-4 py-2 rounded-lg hover:bg-emerald-600 disabled:opacity-50"
          >
            ▶ Start
          </button>
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium text-zinc-500 mb-2">Recent entries</p>
        {entries.slice(0, 5).map((entry) => (
          <div
            key={entry.id}
            className="flex justify-between items-center py-2 border-b border-zinc-50 text-sm"
          >
            <div>
              <p className="text-zinc-800">{entry.tasks?.title}</p>
              <p className="text-[10px] text-zinc-400">
                {format(new Date(entry.started_at), "MMM d, h:mm a")}
                {entry.duration_minutes &&
                  ` · ${Math.floor(entry.duration_minutes / 60)}h ${entry.duration_minutes % 60}m`}
              </p>
            </div>
            {entry.billable && (
              <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
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
