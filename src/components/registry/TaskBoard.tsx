"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import {
  isThisWeek,
  isToday,
  isTomorrow,
  parseISO,
  startOfDay,
} from "date-fns";
import { usePmChatStore } from "@/lib/pm-chat-store";

type Task = {
  id: string;
  title: string;
  status: string;
  projects?: { id: string; title: string };
  estimated_hours?: number;
  due_date?: string;
};

export function TaskBoard({
  projectId: projectIdProp,
}: {
  projectId?: string;
}) {
  const { user } = useUser();
  const taskBoardProjectId = usePmChatStore((s) => s.taskBoardProjectId);
  const taskBoardProjectTitle = usePmChatStore((s) => s.taskBoardProjectTitle);
  const taskStatusFilter = usePmChatStore((s) => s.taskStatusFilter);
  const clearTaskFilters = usePmChatStore((s) => s.clearTaskFilters);

  const pmTaskFilterKey = `${taskBoardProjectId ?? ""}:${taskStatusFilter ?? ""}`;
  const effectiveProjectId = projectIdProp ?? taskBoardProjectId ?? undefined;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    estimated_hours: "",
    project_id: "",
    due_date: "",
  });

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: "",
    estimated_hours: "",
    due_date: "",
  });

  const load = useCallback(async () => {
    if (!user?.id) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const pm = usePmChatStore.getState();
    const projectId = projectIdProp ?? pm.taskBoardProjectId ?? undefined;
    const statusFilter = pm.taskStatusFilter;
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (
      statusFilter &&
      !statusFilter.startsWith("due:") &&
      statusFilter !== "overdue"
    )
      params.set("status", statusFilter);
    const res = await fetch(`/api/tasks?${params}`);
    const json = await res.json();
    setTasks(json.data || []);
    setLoading(false);
  }, [user?.id, projectIdProp]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) void load();
    });
    return () => {
      cancelled = true;
    };
  }, [load, pmTaskFilterKey]);
  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener("freelanceos:pm-refresh", onRefresh);
    return () =>
      window.removeEventListener("freelanceos:pm-refresh", onRefresh);
  }, [load]);
  useEffect(() => {
    if (user?.id && !effectiveProjectId)
      fetch("/api/projects")
        .then((r) => r.json())
        .then((j) => setProjects(j.data || []));
  }, [user?.id, effectiveProjectId]);
  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setNewTask((p) => ({
        ...p,
        project_id: effectiveProjectId || p.project_id || "",
      }));
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveProjectId]);

  const displayedTasks = useMemo(() => {
    const list = tasks;
    const f = taskStatusFilter;
    if (!f) return list;
    if (f === "overdue") {
      const today = startOfDay(new Date());
      return list.filter((t) => {
        if (t.status === "done") return false;
        if (!t.due_date) return false;
        try {
          return startOfDay(parseISO(t.due_date)) < today;
        } catch {
          return false;
        }
      });
    }
    if (f.startsWith("due:")) {
      const key = f.slice(4);
      return list.filter((t) => {
        if (!t.due_date) return false;
        try {
          const d = parseISO(t.due_date);
          if (key === "today") return isToday(d);
          if (key === "tomorrow") return isTomorrow(d);
          if (key === "this week") return isThisWeek(d, { weekStartsOn: 1 });
        } catch {
          return false;
        }
        return false;
      });
    }
    return list;
  }, [tasks, taskStatusFilter]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newTask.title,
        project_id: newTask.project_id,
        estimated_hours: newTask.estimated_hours
          ? Number(newTask.estimated_hours)
          : null,
        due_date: newTask.due_date || null,
        status: "todo",
      }),
    });
    if (res.ok) {
      setNewTask({
        title: "",
        estimated_hours: "",
        project_id: effectiveProjectId || "",
        due_date: "",
      });
      setShowForm(false);
      load();
    }
  }

  async function toggleTask(id: string, currentStatus: string) {
    const newStatus = currentStatus === "done" ? "todo" : "done";
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: newStatus }),
    });
    if (res.ok) load();
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        title: editForm.title.trim(),
        estimated_hours: editForm.estimated_hours
          ? Number(editForm.estimated_hours)
          : null,
        due_date: editForm.due_date || null,
      }),
    });
    if (res.ok) {
      setEditingId(null);
      load();
    }
  }

  function startEdit(task: Task) {
    setEditForm({
      title: task.title,
      estimated_hours:
        task.estimated_hours != null ? String(task.estimated_hours) : "",
      due_date: task.due_date ? task.due_date.slice(0, 10) : "",
    });
    setEditingId(task.id);
  }

  if (loading)
    return (
      <div className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-8 animate-pulse">
        Loading tasks...
      </div>
    );

  const filterPills: { label: string; onRemove: () => void }[] = [];
  if (effectiveProjectId)
    filterPills.push({
      label: `Project: ${taskBoardProjectTitle ?? "selected"}`,
      onRemove: () => {
        usePmChatStore.getState().setTaskView(null, null);
        window.dispatchEvent(new Event("freelanceos:pm-refresh"));
      },
    });
  if (taskStatusFilter)
    filterPills.push({
      label: `Filter: ${taskStatusFilter}`,
      onRemove: () => {
        usePmChatStore.getState().setTaskStatusFilter(null);
        window.dispatchEvent(new Event("freelanceos:pm-refresh"));
      },
    });

  return (
    <motion.div
      layoutId="TaskBoard"
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5"
    >
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
          Tasks {effectiveProjectId ? "" : "(All)"}
        </h2>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
        >
          {showForm ? "Cancel" : "+ Add Task"}
        </button>
      </div>

      {filterPills.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {filterPills.map((pill) => (
            <span
              key={pill.label}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-violet-50 dark:bg-violet-950/50 text-violet-700 dark:text-violet-300 border border-violet-100 dark:border-violet-900"
            >
              {pill.label}
              <button
                type="button"
                className="hover:text-violet-900 dark:hover:text-violet-100"
                onClick={pill.onRemove}
                aria-label={`Remove ${pill.label}`}
              >
                ✕
              </button>
            </span>
          ))}
          <button
            type="button"
            onClick={() => {
              clearTaskFilters();
              window.dispatchEvent(new Event("freelanceos:pm-refresh"));
            }}
            className="text-[11px] text-zinc-500 underline"
          >
            Clear all
          </button>
        </div>
      )}

      {showForm && (
        <form onSubmit={createTask} className="mb-4 space-y-2">
          <input
            placeholder="Task title"
            value={newTask.title}
            required
            onChange={(e) =>
              setNewTask((p) => ({ ...p, title: e.target.value }))
            }
            className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950"
          />
          {!effectiveProjectId && (
            <select
              value={newTask.project_id}
              required
              onChange={(e) =>
                setNewTask((p) => ({ ...p, project_id: e.target.value }))
              }
              className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950"
            >
              <option value="">Select project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              type="number"
              placeholder="Est. hours"
              value={newTask.estimated_hours}
              onChange={(e) =>
                setNewTask((p) => ({ ...p, estimated_hours: e.target.value }))
              }
              className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950"
            />
            <input
              type="date"
              value={newTask.due_date}
              onChange={(e) =>
                setNewTask((p) => ({ ...p, due_date: e.target.value }))
              }
              className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950"
            />
          </div>
          <button
            type="submit"
            className="w-full text-sm bg-violet-600 text-white py-2 rounded-lg hover:bg-violet-700"
          >
            Add Task
          </button>
        </form>
      )}

      <div className="space-y-2">
        {displayedTasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 border border-zinc-100 dark:border-zinc-800 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
          >
            <button
              type="button"
              onClick={() => toggleTask(task.id, task.status)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 ${task.status === "done" ? "bg-emerald-500 border-emerald-500" : "border-zinc-300 dark:border-zinc-600"}`}
            >
              {task.status === "done" && (
                <span className="text-white text-xs">✓</span>
              )}
            </button>

            {editingId === task.id ? (
              <div className="flex-1 space-y-2">
                <input
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, title: e.target.value }))
                  }
                  className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-950"
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={editForm.estimated_hours}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        estimated_hours: e.target.value,
                      }))
                    }
                    className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-950"
                    placeholder="Est. hours"
                  />
                  <input
                    type="date"
                    value={editForm.due_date}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, due_date: e.target.value }))
                    }
                    className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 bg-white dark:bg-zinc-950"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(task.id)}
                    className="text-xs bg-violet-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-violet-700 transition-colors"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-xs border border-zinc-200 dark:border-zinc-700 px-3 py-1 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${task.status === "done" ? "line-through text-zinc-400" : "text-zinc-800 dark:text-zinc-200"}`}
                  >
                    {task.title}
                  </p>
                  <div className="flex gap-2 text-[10px] text-zinc-400 flex-wrap">
                    {task.projects?.title && <span>{task.projects.title}</span>}
                    {task.estimated_hours != null && (
                      <span>~{task.estimated_hours}h</span>
                    )}
                    {task.due_date && (
                      <span>
                        Due{" "}
                        {new Date(task.due_date).toLocaleDateString("en-IN")}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => startEdit(task)}
                    className="text-[10px] text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors font-medium"
                  >
                    ✎
                  </button>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full ${task.status === "done" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400" : task.status === "in_progress" ? "bg-amber-50 text-amber-600 dark:bg-amber-950 dark:text-amber-400" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"}`}
                  >
                    {task.status}
                  </span>
                </div>
              </>
            )}
          </div>
        ))}
        {displayedTasks.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">
            No tasks match this view.
          </p>
        )}
      </div>
    </motion.div>
  );
}
