"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";

export function TaskBoard({ projectId }: { projectId?: string }) {
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
  const [projects, setProjects] = useState<{ id: string; title: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newTask, setNewTask] = useState({
    title: "",
    estimated_hours: "",
    project_id: projectId || "",
    due_date: "",
  });

  useEffect(() => {
    if (user?.id) {
      load();
      if (!projectId) loadProjects();
    }
  }, [user?.id, projectId]);

  async function load() {
    setLoading(true);
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`/api/tasks?${params}`);
    const json = await res.json();
    setTasks(json.data || []);
    setLoading(false);
  }

  async function loadProjects() {
    const res = await fetch("/api/projects");
    const json = await res.json();
    setProjects(json.data || []);
  }

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
      }),
    });
    if (res.ok) {
      setNewTask({
        title: "",
        estimated_hours: "",
        project_id: projectId || "",
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

  if (loading)
    return (
      <div className="bg-white border rounded-xl p-8 animate-pulse">
        Loading tasks...
      </div>
    );

  return (
    <motion.div
      layoutId="TaskBoard"
      className="bg-white border border-zinc-100 rounded-xl p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">
          Tasks {projectId ? "" : "(All)"}
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg"
        >
          {showForm ? "Cancel" : "+ Add Task"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={createTask} className="mb-4 space-y-2">
          <input
            placeholder="Task title"
            value={newTask.title}
            required
            onChange={(e) =>
              setNewTask((p) => ({ ...p, title: e.target.value }))
            }
            className="w-full text-sm border rounded-lg px-3 py-2"
          />
          {!projectId && (
            <select
              value={newTask.project_id}
              required
              onChange={(e) =>
                setNewTask((p) => ({ ...p, project_id: e.target.value }))
              }
              className="w-full text-sm border rounded-lg px-3 py-2"
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
              className="flex-1 text-sm border rounded-lg px-3 py-2"
            />
            <input
              type="date"
              value={newTask.due_date}
              onChange={(e) =>
                setNewTask((p) => ({ ...p, due_date: e.target.value }))
              }
              className="flex-1 text-sm border rounded-lg px-3 py-2"
            />
          </div>
          <button
            type="submit"
            className="w-full text-sm bg-violet-600 text-white py-2 rounded-lg"
          >
            Add Task
          </button>
        </form>
      )}

      <div className="space-y-2">
        {tasks.map((task) => (
          <div
            key={task.id}
            className="flex items-center gap-3 p-3 border rounded-lg hover:bg-zinc-50"
          >
            <button
              onClick={() => toggleTask(task.id, task.status)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                task.status === "done"
                  ? "bg-emerald-500 border-emerald-500"
                  : "border-zinc-300"
              }`}
            >
              {task.status === "done" && (
                <span className="text-white text-xs">✓</span>
              )}
            </button>
            <div className="flex-1">
              <p
                className={`text-sm ${task.status === "done" ? "line-through text-zinc-400" : "text-zinc-800"}`}
              >
                {task.title}
              </p>
              <div className="flex gap-2 text-[10px] text-zinc-400">
                {task.projects?.title && <span>{task.projects.title}</span>}
                {task.estimated_hours && <span>~{task.estimated_hours}h</span>}
                {task.due_date && (
                  <span>
                    Due {new Date(task.due_date).toLocaleDateString("en-IN")}
                  </span>
                )}
              </div>
            </div>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                task.status === "done"
                  ? "bg-emerald-50 text-emerald-600"
                  : task.status === "in_progress"
                    ? "bg-amber-50 text-amber-600"
                    : "bg-zinc-100 text-zinc-500"
              }`}
            >
              {task.status}
            </span>
          </div>
        ))}
        {tasks.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">No tasks yet</p>
        )}
      </div>
    </motion.div>
  );
}
