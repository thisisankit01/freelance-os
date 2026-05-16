"use client";

import { useEffect, useState, useRef, type DragEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import { Pencil, X, Calendar, DollarSign, User, FileText, Sparkles } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not Started",
  in_progress: "In Progress",
  review: "Review",
  done: "Done",
  on_hold: "On Hold",
};

const STATUS_COLORS: Record<string, string> = {
  not_started:
    "bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300 border border-violet-100 dark:border-violet-900",
  in_progress:
    "bg-indigo-50 dark:bg-indigo-950/35 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900",
  review:
    "bg-fuchsia-50 dark:bg-fuchsia-950/30 text-fuchsia-600 dark:text-fuchsia-300 border border-fuchsia-100 dark:border-fuchsia-900",
  done:
    "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900",
  on_hold:
    "bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-300 border border-rose-100 dark:border-rose-900",
};

const STATUS_DOT: Record<string, string> = {
  not_started: "bg-zinc-400",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  done: "bg-emerald-500",
  on_hold: "bg-rose-500",
};

type Project = {
  id: string;
  title: string;
  description: string | null;
  budget: number | null;
  deadline: string | null;
  client_id: string | null;
  status: string;
  clients?: { id: string; name: string };
};

// ─── URL helpers ─────────────────────────────────────────────────────────────
// Modal state is driven by ?editProject=<id> in the URL.
// This lets deep-linking, AI triggers, and back-button all work.

export function ProjectBoard() {
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<Project[]>([]);
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
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);

  // ─── EDIT FORM STATE (modal data, url controls open/close) ────────────────
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    budget: "",
    deadline: "",
    client_id: "",
    status: "",
  });
  const [savingEdit, setSavingEdit] = useState(false);
  const [polishing, setPolishing] = useState<"new" | "edit" | null>(null);
  const prevEditId = useRef<string | null>(null);

  // Derive editing project from URL param
  const editProjectId = searchParams.get("editProject");
  const editingProject = editProjectId
    ? (projects.find((p) => p.id === editProjectId) ?? null)
    : null;

  // Sync form when modal opens for a new project
  useEffect(() => {
    if (editProjectId && editProjectId !== prevEditId.current) {
      const project = projects.find((p) => p.id === editProjectId);
      if (project) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEditForm({
          title: project.title,
          description: project.description || "",
          budget: project.budget ? String(project.budget) : "",
          deadline: project.deadline ? project.deadline.slice(0, 10) : "",
          client_id: project.client_id || "",
          status: project.status,
        });
        prevEditId.current = editProjectId;
      }
    }
    if (!editProjectId) prevEditId.current = null;
  }, [editProjectId, projects]);

  // Listen for AI-triggered "edit project" events
  useEffect(() => {
    const onEditProject = (e: Event) => {
      const detail = (e as CustomEvent<{ id?: string; title?: string }>).detail;
      if (detail?.id) {
        openEditModal(detail.id);
      } else if (detail?.title) {
        // Fuzzy match by title
        const match =
          projects.find(
            (p) => p.title.toLowerCase() === detail.title!.toLowerCase(),
          ) ??
          projects.find((p) =>
            p.title.toLowerCase().includes(detail.title!.toLowerCase()),
          );
        if (match) openEditModal(match.id);
      }
    };
    window.addEventListener("soloos:edit-project", onEditProject);
    return () =>
      window.removeEventListener("soloos:edit-project", onEditProject);
  }, [projects]);

  useEffect(() => {
    if (user?.id) {
      load();
      loadClients();
    }
  }, [user?.id]);

  useEffect(() => {
    const onRefresh = () => {
      if (user?.id) load();
    };
    window.addEventListener("soloos:pm-refresh", onRefresh);
    return () => window.removeEventListener("soloos:pm-refresh", onRefresh);
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

  // ─── URL-BASED MODAL HELPERS ──────────────────────────────────────────────

  function openEditModal(projectId: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("editProject", projectId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function closeEditModal() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("editProject");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
        typeof json.error === "string"
          ? json.error
          : "Could not create project",
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

  async function saveEdit() {
    if (!editingProject) return;
    setSavingEdit(true);
    const res = await fetch("/api/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingProject.id,
        title: editForm.title.trim(),
        description: editForm.description.trim() || null,
        budget: editForm.budget ? Number(editForm.budget) : null,
        deadline: editForm.deadline || null,
        client_id: editForm.client_id || null,
        status: editForm.status,
      }),
    });
    setSavingEdit(false);
    if (res.ok) {
      closeEditModal();
      load();
    }
  }

  async function polishProjectDescription(mode: "new" | "edit") {
    const source = mode === "new" ? newProject : editForm;
    const title = source.title.trim() || editingProject?.title || "Untitled project";
    const client = clients.find((c) => c.id === source.client_id)?.name;
    setPolishing(mode);
    const res = await fetch("/api/ai-polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: "project description",
        text: source.description,
        context: `Project: ${title}\nClient: ${client || "Not assigned"}\nBudget: ${source.budget || "Not set"}\nDeadline: ${source.deadline || "Not set"}`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && typeof json.text === "string") {
      if (mode === "new") {
        setNewProject((p) => ({ ...p, description: json.text }));
      } else {
        setEditForm((p) => ({ ...p, description: json.text }));
      }
    }
    setPolishing(null);
  }

  function onProjectDragStart(e: DragEvent, projectId: string) {
    e.dataTransfer.setData("text/soloos-project-id", projectId);
    e.dataTransfer.effectAllowed = "move";
    setDraggingId(projectId);
  }

  function onProjectDragEnd() {
    setDraggingId(null);
    setDragOverStatus(null);
  }

  function onColumnDragOver(e: DragEvent, statusKey: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverStatus(statusKey);
  }

  async function onColumnDrop(e: DragEvent, statusKey: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/soloos-project-id");
    setDraggingId(null);
    setDragOverStatus(null);
    if (!id) return;
    const proj = projects.find((p) => p.id === id);
    if (proj && proj.status !== statusKey) await moveStatus(id, statusKey);
  }

  const statuses = ["not_started", "in_progress", "review", "done", "on_hold"];

  if (loading)
    return (
      <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-8 animate-pulse">
        Loading projects...
      </div>
    );

  return (
    <>
      <motion.div
        layoutId="ProjectBoard"
        className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5 shadow-sm relative"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100">
            Projects
          </h2>
          <button
            type="button"
            onClick={() => {
              setFormError(null);
              setShowForm((v) => !v);
            }}
            className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700 transition-colors"
          >
            {showForm ? "Cancel" : "+ New Project"}
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mb-3">
          Drag cards between columns on desktop, use the mobile dropdown below,
          or use chat commands like{" "}
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            edit project [name]
          </span>{" "}
          or{" "}
          <span className="font-medium text-zinc-600 dark:text-zinc-300">
            put project [name] on hold
          </span>
          .
        </p>

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
                <p className="text-xs text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded-lg px-2 py-1.5">
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
                className="w-full text-sm border dark:border-zinc-700 dark:bg-zinc-950 rounded-lg px-3 py-2"
              />
              <div className="relative">
                <textarea
                  placeholder="Write a short project brief"
                  value={newProject.description}
                  rows={3}
                  onChange={(e) =>
                    setNewProject((p) => ({ ...p, description: e.target.value }))
                  }
                  className="w-full text-sm border dark:border-zinc-700 dark:bg-zinc-950 rounded-lg pl-3 pr-12 py-2"
                />
                <button
                  type="button"
                  onClick={() => polishProjectDescription("new")}
                  disabled={polishing === "new"}
                  className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-600 hover:bg-violet-50 dark:bg-zinc-950 dark:border-violet-800 dark:text-violet-300 disabled:opacity-60"
                  title="Improve with AI"
                >
                  <Sparkles className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type="number"
                  placeholder="Budget ₹"
                  value={newProject.budget}
                  onChange={(e) =>
                    setNewProject((p) => ({ ...p, budget: e.target.value }))
                  }
                  className="flex-1 text-sm border dark:border-zinc-700 dark:bg-zinc-950 rounded-lg px-3 py-2"
                />
                <input
                  type="date"
                  value={newProject.deadline}
                  onChange={(e) =>
                    setNewProject((p) => ({ ...p, deadline: e.target.value }))
                  }
                  className="flex-1 text-sm border dark:border-zinc-700 dark:bg-zinc-950 rounded-lg px-3 py-2"
                />
              </div>
              <select
                value={newProject.client_id}
                onChange={(e) =>
                  setNewProject((p) => ({ ...p, client_id: e.target.value }))
                }
                className="w-full text-sm border dark:border-zinc-700 dark:bg-zinc-950 rounded-lg px-3 py-2"
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
                className="text-xs bg-violet-600 text-white px-3 py-1.5 rounded-lg hover:bg-violet-700"
              >
                Create Project
              </button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {statuses.map((status) => (
            <div
              key={status}
              onDragOver={(e) => onColumnDragOver(e, status)}
              onDragLeave={() =>
                setDragOverStatus((s) => (s === status ? null : s))
              }
              onDrop={(e) => onColumnDrop(e, status)}
              className={`rounded-lg p-2 min-h-[200px] transition-[box-shadow,background-color] ${
                draggingId && dragOverStatus === status
                  ? "bg-violet-50 dark:bg-violet-950/40 ring-2 ring-violet-400 dark:ring-violet-500"
                  : "bg-zinc-50 dark:bg-zinc-800/60"
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2 justify-center">
                {/* <span
                  className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status]}`}
                /> */}
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  {STATUS_LABELS[status]}
                </p>
                <span className="text-[10px] text-zinc-400 dark:text-zinc-600 ml-auto">
                  {projects.filter((p) => p.status === status).length}
                </span>
              </div>

              {projects
                .filter((p) => p.status === status)
                .map((project) => (
                  <div
                    key={project.id}
                    draggable
                    onDragStart={(e: DragEvent) =>
                      onProjectDragStart(e, project.id)
                    }
                    onDragEnd={onProjectDragEnd}
                    className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 mb-2 cursor-grab active:cursor-grabbing hover:shadow-sm hover:border-zinc-300 dark:hover:border-zinc-600 transition-all select-none ${
                      draggingId === project.id ? "opacity-50 scale-[0.97]" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-zinc-800 dark:text-zinc-100 flex-1 min-w-0 truncate leading-tight">
                        {project.title}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(project.id);
                        }}
                        className="text-zinc-300 hover:text-violet-600 dark:text-zinc-600 dark:hover:text-violet-400 transition-colors flex-shrink-0 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        title="Edit project"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>

                    {project.clients?.name && (
                      <p className="text-[10px] text-violet-500 dark:text-violet-400 mt-0.5 truncate">
                        {project.clients.name}
                      </p>
                    )}
                    {project.budget ? (
                      <p className="text-[10px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                        ₹{project.budget.toLocaleString("en-IN")}
                      </p>
                    ) : null}
                    {project.deadline ? (
                      <p
                        className={`text-[10px] mt-0.5 ${
                          new Date(project.deadline) < new Date()
                            ? "text-red-500"
                            : "text-zinc-400"
                        }`}
                      >
                        Due{" "}
                        {new Date(project.deadline).toLocaleDateString("en-IN")}
                      </p>
                    ) : null}

                    <div className="mt-3">
                      <label className="sr-only">Project status</label>
                      <select
                        value={project.status}
                        onChange={(e) => moveStatus(project.id, e.target.value)}
                        className="w-full text-[11px] border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-950 text-zinc-700 dark:text-zinc-300"
                      >
                        {statuses.map((option) => (
                          <option key={option} value={option}>
                            {STATUS_LABELS[option]}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
            </div>
          ))}
        </div>
      </motion.div>

      {/* ─── EDIT MODAL (URL-driven) ──────────────────────────────────────── */}
      <AnimatePresence>
        {editingProject && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-zinc-950/60 backdrop-blur-sm"
              onClick={closeEditModal}
            />

            {/* Modal */}
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 12 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 8 }}
              transition={{ type: "spring", stiffness: 440, damping: 32 }}
              className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            >
              {/* Header */}
              <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span
                        className={`text-[10px] font-medium mx-0 px-2 my-1 py-0.5 rounded-md ${STATUS_COLORS[editingProject.status]}`}
                      >
                        {STATUS_LABELS[editingProject.status]}
                      </span>
                    </div>
                    <h3 className="text-base font-semibold text-zinc-800 dark:text-zinc-100 truncate">
                      {editingProject.title}
                    </h3>
                  </div>
                  <button
                    onClick={closeEditModal}
                    className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 flex-shrink-0"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="p-5 space-y-4">
                {/* Title */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                    <FileText className="w-3 h-3" /> Title
                  </label>
                  <input
                    value={editForm.title}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, title: e.target.value }))
                    }
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                    Description
                  </label>
                  <div className="relative">
                    <textarea
                      value={editForm.description}
                      placeholder="Write a short project brief"
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          description: e.target.value,
                        }))
                      }
                      rows={4}
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg pl-3 pr-12 py-2 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all resize-none"
                    />
                    <button
                      type="button"
                      onClick={() => polishProjectDescription("edit")}
                      disabled={polishing === "edit"}
                      className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-violet-300 bg-white text-violet-600 hover:bg-violet-50 dark:bg-zinc-950 dark:border-violet-800 dark:text-violet-300 disabled:opacity-60"
                      title="Improve with AI"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Budget + Deadline */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                      <DollarSign className="w-3 h-3" /> Budget (₹)
                    </label>
                    <input
                      type="number"
                      value={editForm.budget}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, budget: e.target.value }))
                      }
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                      <Calendar className="w-3 h-3" /> Deadline
                    </label>
                    <input
                      type="date"
                      value={editForm.deadline}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, deadline: e.target.value }))
                      }
                      className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                    />
                  </div>
                </div>

                {/* Status */}
                <div>
                  <label className="text-xs font-medium text-zinc-500 dark:text-zinc-400 block mb-1.5">
                    Status
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {statuses.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() =>
                          setEditForm((f) => ({ ...f, status: s }))
                        }
                        className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-all ${
                          editForm.status === s
                            ? STATUS_COLORS[s] +
                              " ring-1 ring-violet-200 dark:ring-violet-900"
                            : "border border-violet-100 bg-violet-50/70 text-violet-500 hover:bg-violet-100 dark:border-violet-900 dark:bg-violet-950/25 dark:text-violet-300 dark:hover:bg-violet-950/45"
                        }`}
                      >
                        {STATUS_LABELS[s]}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Client */}
                <div>
                  <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
                    <User className="w-3 h-3" /> Client
                  </label>
                  <select
                    value={editForm.client_id}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, client_id: e.target.value }))
                    }
                    className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-950 text-zinc-800 dark:text-zinc-200 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                  >
                    <option value="">No client</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Footer */}
              <div className="px-5 pb-5 flex gap-2 justify-end">
                <button
                  onClick={saveEdit}
                  disabled={savingEdit || !editForm.title.trim()}
                  className="text-xs bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                >
                  {savingEdit ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Save Changes"
                  )}
                </button>
                <button
                  onClick={closeEditModal}
                  className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
