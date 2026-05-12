"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  on_hold: "On Hold",
};

export function ProjectBoard() {
  const { user } = useUser();
  const [projects, setProjects] = useState<
    {
      id: string;
      title: string;
      description: string;
      budget: number;
      deadline: string;
      client_id: string;
      status: string;
      clients?: { id: string; name: string };
    }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [newProject, setNewProject] = useState({
    title: "",
    description: "",
    budget: "",
    deadline: "",
    client_id: "",
  });
  const [clients, setClients] = useState<{ id: string; name: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.id) {
      load();
      loadClients();
    }
  }, [user?.id]);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/projects");
    const json = await res.json();
    setProjects(json.data || []);
    setLoading(false);
  }

  async function loadClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", user?.id);
    setClients(data || []);
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: newProject.title.trim(),
        description: newProject.description.trim() || null,
        budget: newProject.budget ? Number(newProject.budget) : null,
        deadline: newProject.deadline || null,
        client_id: newProject.client_id || null,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok) {
      setNewProject({
        title: "",
        description: "",
        budget: "",
        deadline: "",
        client_id: "",
      });
      setShowForm(false);
      load();
    } else {
      setFormError(
        typeof json.error === "string" ? json.error : "Could not create project",
      );
    }
  }

  async function moveStatus(id: string, status: string) {
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    if (res.ok) load();
  }

  const statuses = ["not_started", "in_progress", "review", "done", "on_hold"];

  if (loading)
    return (
      <div className="bg-white border rounded-xl p-8 animate-pulse">
        Loading projects...
      </div>
    );

  return (
    <motion.div
      layoutId="ProjectBoard"
      className="bg-white border border-zinc-100 rounded-xl p-5"
    >
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-zinc-800">Projects</h2>
        <button
          onClick={() => {
            setFormError(null);
            setShowForm((v) => !v);
          }}
          className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg"
        >
          {showForm ? "Cancel" : "+ New Project"}
        </button>
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            onSubmit={createProject}
            className="mb-4 space-y-2 overflow-hidden"
          >
            {formError && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-2 py-1.5">
                {formError}
              </p>
            )}
            <input
              placeholder="Project title"
              value={newProject.title}
              required
              onChange={(e) =>
                setNewProject((p) => ({ ...p, title: e.target.value }))
              }
              className="w-full text-sm border rounded-lg px-3 py-2"
            />
            <textarea
              placeholder="Description"
              value={newProject.description}
              rows={2}
              onChange={(e) =>
                setNewProject((p) => ({ ...p, description: e.target.value }))
              }
              className="w-full text-sm border rounded-lg px-3 py-2"
            />
            <div className="flex gap-2">
              <input
                type="number"
                placeholder="Budget ₹"
                value={newProject.budget}
                onChange={(e) =>
                  setNewProject((p) => ({ ...p, budget: e.target.value }))
                }
                className="flex-1 text-sm border rounded-lg px-3 py-2"
              />
              <input
                type="date"
                value={newProject.deadline}
                onChange={(e) =>
                  setNewProject((p) => ({ ...p, deadline: e.target.value }))
                }
                className="flex-1 text-sm border rounded-lg px-3 py-2"
              />
            </div>
            <select
              value={newProject.client_id}
              onChange={(e) =>
                setNewProject((p) => ({ ...p, client_id: e.target.value }))
              }
              className="w-full text-sm border rounded-lg px-3 py-2"
            >
              <option value="">No client</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full text-sm bg-violet-600 text-white py-2 rounded-lg"
            >
              Create Project
            </button>
          </motion.form>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-5 gap-2">
        {statuses.map((status) => (
          <div key={status} className="bg-zinc-50 rounded-lg p-2 min-h-[200px]">
            <p className="text-xs font-medium text-zinc-500 mb-2 text-center">
              {STATUS_LABELS[status]}
            </p>
            {projects
              .filter((p) => p.status === status)
              .map((project) => (
                <motion.div
                  key={project.id}
                  layoutId={project.id}
                  className="bg-white border rounded-lg p-2 mb-2 cursor-pointer hover:shadow-sm transition-shadow"
                >
                  <p className="text-sm font-medium text-zinc-800">
                    {project.title}
                  </p>
                  {project.clients?.name && (
                    <p className="text-[10px] text-zinc-400">
                      {project.clients.name}
                    </p>
                  )}
                  {project.budget && (
                    <p className="text-[10px] text-zinc-500">
                      ₹{project.budget.toLocaleString("en-IN")}
                    </p>
                  )}
                  {project.deadline && (
                    <p
                      className={`text-[10px] ${new Date(project.deadline) < new Date() ? "text-red-500" : "text-zinc-400"}`}
                    >
                      Due{" "}
                      {new Date(project.deadline).toLocaleDateString("en-IN")}
                    </p>
                  )}
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {statuses
                      .filter((s) => s !== status)
                      .map((s) => (
                        <button
                          key={s}
                          onClick={() => moveStatus(project.id, s)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-600"
                        >
                          → {STATUS_LABELS[s]}
                        </button>
                      ))}
                  </div>
                </motion.div>
              ))}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
