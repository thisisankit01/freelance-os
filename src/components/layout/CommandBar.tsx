"use client";
// src/components/layout/CommandBar.tsx

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { useUser } from "@clerk/nextjs";
import { runAppointmentAiAction } from "@/lib/appointment-ai-actions";
import { hydratePmChatFromStorage, usePmChatStore } from "@/lib/pm-chat-store";
import {
  parsePmCommand,
  stripPlaceholderBrackets,
  type ParsedPmCommand,
} from "@/lib/pm-command-parser";
import { runPmCommand } from "@/lib/pm-command-runner";
import { isPmWorkspaceActive } from "@/lib/pm-workspace";
import {
  Command,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command";
import {
  useCommandSuggestions,
  type ScoredSuggestion,
} from "@/lib/use-command-suggestions";

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface CommandBarProps {
  isEmpty?: boolean;
  greeting?: string;
}

type WorkspaceChip = { label: string; payload: string };

function pmCommandSoloLayout(
  kind: ParsedPmCommand["kind"],
): "ProjectBoard" | "TaskBoard" | null {
  switch (kind) {
    case "list_projects":
    case "create_project":
    case "rename_project":
    case "delete_project":
    case "set_project_status":
      return "ProjectBoard";
    case "show_tasks":
    case "filter_tasks_status":
    case "clear_filters":
    case "add_task":
    case "mark_task":
    case "mark_task_by_id":
    case "delete_task":
    case "delete_task_by_id":
    case "mark_all_tasks":
      return "TaskBoard";
    default:
      return null;
  }
}

// ─── COMPONENT ────────────────────────────────────────────────────────────────

export function CommandBar({
  isEmpty = false,
  greeting = "",
}: CommandBarProps) {
  const { user } = useUser();
  const activeComponents = useStore((s) => s.activeComponents);
  const workspaceMode = !isEmpty && isPmWorkspaceActive(activeComponents);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [workspaceChips, setWorkspaceChips] = useState<WorkspaceChip[] | null>(
    null,
  );
  const [isListening, setIsListening] = useState(false);
  const [dockOpen, setDockOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [ignoreClicksUntil, setIgnoreClicksUntil] = useState(0);

  // Entity data for AI hints + live search
  const [entityRows, setEntityRows] = useState<{
    projects: { id: string; title: string }[];
    clients: { id: string; name: string }[];
  }>({ projects: [], clients: [] });

  const inputRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const hydratedRef = useRef(false);
  const suggestionsVersionRef = useRef(0);

  // Voice refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxStartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const speakingRef = useRef(false);
  const isListeningRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const handleSubmitRef = useRef<(prompt: string) => Promise<void>>(
    async () => {},
  );

  const {
    setComponents,
    setFilter,
    clearFilters,
    setEmptyMessage,
    setAppointmentAction,
    clearAppointmentAction,
    filters,
  } = useStore();

  // ─── NEW: Instant suggestions hook ───────────────────────────────────────────
  const { suggestions: instantSuggestions, refreshHints } =
    useCommandSuggestions(input, entityRows);

  // Deferred hydration
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const id = setTimeout(() => hydratePmChatFromStorage(), 0);
    return () => clearTimeout(id);
  }, []);

  // Load entity data when dock opens (for AI hints + live entity matching)
  useEffect(() => {
    if (!dockOpen) return;
    let cancelled = false;

    const run = async () => {
      try {
        const entRes = await fetch("/api/command-suggestions");
        const entJson = await entRes.json().catch(() => ({}));
        if (cancelled) return;
        const projects = Array.isArray(entJson.projects)
          ? entJson.projects
          : [];
        const clients = Array.isArray(entJson.clients) ? entJson.clients : [];
        setEntityRows({ projects, clients });

        // Refresh AI hints with real entity names
        refreshHints({
          workspaceMode,
          projects: projects.map((p: { title: string }) => p.title),
          clients: clients.map((c: { name: string }) => c.name),
        });
      } catch {
        // Silently fail — static suggestions still work
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [dockOpen, workspaceMode, refreshHints]);

  // Reset selection when suggestions change or dock closes
  useEffect(() => {
    setSelectedIndex(-1);
  }, [input, dockOpen, instantSuggestions.length]);

  // Guard against ghost-clicks for 200ms after dock opens
  useEffect(() => {
    if (dockOpen) {
      setIgnoreClicksUntil(Date.now() + 200);
    }
  }, [dockOpen]);

  // ─── SUBMIT ───────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    async (prompt: string) => {
      const trimmed = prompt.trim();
      if (!trimmed || loading) return;

      setDockOpen(false);
      setWorkspaceChips(null);
      setLoading(true);
      setInput("");

      try {
        let parsed = parsePmCommand(trimmed);
        if (
          parsed &&
          (parsed.kind === "confirm_yes" || parsed.kind === "confirm_no") &&
          !usePmChatStore.getState().pendingConfirm &&
          !workspaceMode
        ) {
          parsed = null;
        }

        if (parsed) {
          setAiMessage("Working…");
          if (
            !trimmed.startsWith("__pm:") &&
            parsed.kind !== "confirm_yes" &&
            parsed.kind !== "confirm_no" &&
            usePmChatStore.getState().pendingConfirm
          ) {
            usePmChatStore.getState().setPendingConfirm(null);
          }
          usePmChatStore.getState().addUserMessage(trimmed);
          try {
            const result = await runPmCommand(parsed);
            usePmChatStore.getState().addAssistantMessage(
              result.reply,
              result.chips?.map((c) => ({
                label: c.label,
                payload: c.payload,
              })),
            );
            window.dispatchEvent(new Event("freelanceos:pm-refresh"));
            const plain = result.reply
              .replace(/\*\*(.+?)\*\*/g, "$1")
              .replace(/\n/g, " · ");
            setAiMessage(plain.slice(0, 220));
            setWorkspaceChips(
              result.chips && result.chips.length > 0 ? result.chips : null,
            );
            setTimeout(() => setAiMessage(""), 6000);
            const solo = pmCommandSoloLayout(parsed.kind);
            if (solo) setComponents([solo]);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "error";
            usePmChatStore
              .getState()
              .addAssistantMessage(`Something went wrong: ${msg}`);
            setAiMessage("Workspace command failed");
            setTimeout(() => setAiMessage(""), 4000);
          }
          return;
        }

        setAiMessage("Thinking…");

        const todayStr = new Date().toISOString().split("T")[0];
        const dayName = new Date().toLocaleString("en-US", { weekday: "long" });
        const promptWithToday = `[TODAY: ${todayStr}, ${dayName}] ${trimmed}`;

        const res = await fetch("/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptWithToday,
            context: { filters },
          }),
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        let data = (await res.json()) as {
          reply?: string;
          changeUI?: boolean;
          components?: string[];
          filters?: Record<string, string>;
          emptyMessage?: string;
          action?: string;
          appointmentData?: Record<string, unknown>;
        };

        let pmRecoveredReply: string | null = null;
        if (data.action === "create_project") {
          const recovered = parsePmCommand(trimmed);
          const rawName =
            recovered?.kind === "create_project"
              ? recovered.name
              : typeof data.appointmentData?.projectTitle === "string"
                ? (data.appointmentData.projectTitle as string)
                : null;
          if (rawName?.trim()) {
            usePmChatStore.getState().addUserMessage(trimmed);
            try {
              const result = await runPmCommand({
                kind: "create_project",
                name: stripPlaceholderBrackets(rawName.trim()),
              });
              usePmChatStore.getState().addAssistantMessage(
                result.reply,
                result.chips?.map((c) => ({
                  label: c.label,
                  payload: c.payload,
                })),
              );
              window.dispatchEvent(new Event("freelanceos:pm-refresh"));
              pmRecoveredReply = result.reply
                .replace(/\*\*(.+?)\*\*/g, "$1")
                .replace(/\n/g, " · ")
                .slice(0, 220);
            } catch (e) {
              const msg = e instanceof Error ? e.message : "error";
              usePmChatStore
                .getState()
                .addAssistantMessage(`Could not create project: ${msg}`);
              pmRecoveredReply = `Could not create project: ${msg}`;
            }
          } else {
            pmRecoveredReply =
              "Say the project name clearly, e.g. **add a project named Acme Corp** or **create project Acme**.";
          }
          data = { ...data, action: "none", appointmentData: {} };
          if (!(data.components ?? []).includes("ProjectBoard")) {
            data = {
              ...data,
              changeUI: true,
              components: ["ProjectBoard", ...(data.components ?? [])],
            };
          }
        }

        clearFilters();
        clearAppointmentAction();

        if (data.changeUI) {
          setComponents(data.components ?? ["StatsBar", "ClientTable"]);
          const newFilters: Record<string, string> = data.filters ?? {};
          Object.entries(newFilters).forEach(([key, value]) => {
            if (value && typeof value === "string") setFilter(key, value);
          });
          if (data.emptyMessage) setEmptyMessage(data.emptyMessage);
        }

        const APPOINTMENT_ACTIONS = new Set([
          "create_appointment",
          "create_appointments_bulk",
          "cancel_appointment",
          "cancel_appointments_bulk",
        ]);
        const isAppointmentMutation = Boolean(
          user?.id && data.action && APPOINTMENT_ACTIONS.has(data.action),
        );

        let exec = null as Awaited<ReturnType<typeof runAppointmentAiAction>>;
        if (isAppointmentMutation) {
          exec = await runAppointmentAiAction({
            userId: user!.id,
            action: data.action!,
            data: (data.appointmentData ?? {}) as Record<string, unknown>,
          });
          if (exec?.ok && typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("freelanceos:appointments"));
          }
        } else if (
          data.action !== "create_project" &&
          data.appointmentData &&
          typeof data.appointmentData === "object" &&
          Object.keys(data.appointmentData).length > 0
        ) {
          setAppointmentAction(
            typeof data.action === "string" ? data.action : "none",
            data.appointmentData as Record<string, string>,
          );
        }

        const base = typeof data.reply === "string" ? data.reply : "Done";
        if (exec) {
          setAiMessage(
            exec.ok ? `${base} ${exec.message}`.trim() : exec.message,
          );
          setTimeout(() => setAiMessage(""), exec.ok ? 3200 : 5000);
        } else if (pmRecoveredReply) {
          setAiMessage(pmRecoveredReply);
          setTimeout(() => setAiMessage(""), 6000);
        } else {
          setAiMessage(base);
          setTimeout(() => setAiMessage(""), 2500);
        }
      } catch (err) {
        console.error("CommandBar error:", err);
        setAiMessage("Something went wrong, try again");
        setTimeout(() => setAiMessage(""), 2000);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, workspaceMode, filters, user],
  );

  useEffect(() => {
    handleSubmitRef.current = handleSubmit;
  }, [handleSubmit]);

  // Press "/" or Ctrl/Cmd+K anywhere to focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCommandK =
        (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k";
      const isSlash = e.key === "/" && !e.ctrlKey && !e.metaKey;

      if (
        (isCommandK || isSlash) &&
        document.activeElement?.tagName !== "INPUT" &&
        document.activeElement?.tagName !== "TEXTAREA"
      ) {
        e.preventDefault();
        inputRef.current?.focus();
        setDockOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Scroll selected suggestion into view
  useEffect(() => {
    if (selectedIndex >= 0) {
      const el = document.getElementById(`cmd-suggestion-${selectedIndex}`);
      el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selectedIndex]);

  // ─── VOICE ────────────────────────────────────────────────────────────────

  const stopRecording = useCallback(() => {
    if (recRef.current && recRef.current.state !== "inactive") {
      try {
        recRef.current.stop();
      } catch {
        /* noop */
      }
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        audioContextRef.current.close();
      } catch {
        /* noop */
      }
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    if (maxStartTimerRef.current) {
      clearTimeout(maxStartTimerRef.current);
      maxStartTimerRef.current = null;
    }
    recRef.current = null;
    audioContextRef.current = null;
    analyserRef.current = null;
    speakingRef.current = false;
    isListeningRef.current = false;
    chunksRef.current = [];
    setIsListening(false);
  }, []);

  async function startVoice() {
    if (isListeningRef.current) {
      stopRecording();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);

      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        try {
          audioContext.close();
        } catch {
          /* noop */
        }

        const chunks = chunksRef.current;
        chunksRef.current = [];

        const totalSize = chunks.reduce((sum, c) => sum + c.size, 0);
        if (totalSize < 200) {
          setAiMessage("Didn't hear anything");
          setTimeout(() => setAiMessage(""), 2000);
          return;
        }

        const blob = new Blob(chunks, { type: "audio/webm" });
        const form = new FormData();
        form.append("file", blob, "audio.webm");

        setAiMessage("Transcribing…");
        try {
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: form,
          });
          const { text } = await res.json();
          if (text?.trim()) {
            setInput(text);
            handleSubmitRef.current(text);
          } else {
            setAiMessage("Could not hear you");
            setTimeout(() => setAiMessage(""), 2000);
          }
        } catch {
          setAiMessage("Transcription failed");
          setTimeout(() => setAiMessage(""), 2000);
        }
      };

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const monitor = () => {
        if (!isListeningRef.current) return;

        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const currentlySpeaking = volume > 15;

        if (currentlySpeaking && !speakingRef.current) {
          speakingRef.current = true;
          setAiMessage("Hearing you…");
          if (maxStartTimerRef.current) {
            clearTimeout(maxStartTimerRef.current);
            maxStartTimerRef.current = null;
          }
        }

        if (speakingRef.current) {
          if (currentlySpeaking) {
            if (silenceTimerRef.current) {
              clearTimeout(silenceTimerRef.current);
              silenceTimerRef.current = null;
            }
          } else if (!silenceTimerRef.current) {
            silenceTimerRef.current = setTimeout(() => {
              if (recRef.current && recRef.current.state !== "inactive") {
                recRef.current.stop();
              }
              isListeningRef.current = false;
              setIsListening(false);
            }, 2000);
          }
        }

        if (isListeningRef.current) {
          requestAnimationFrame(monitor);
        }
      };

      recorder.start(1000);
      requestAnimationFrame(monitor);

      maxStartTimerRef.current = setTimeout(() => {
        if (!speakingRef.current) {
          if (recRef.current && recRef.current.state !== "inactive") {
            recRef.current.stop();
          }
          isListeningRef.current = false;
          setIsListening(false);
          setAiMessage("Didn't hear anything");
          setTimeout(() => setAiMessage(""), 2000);
        }
      }, 5000);

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      recRef.current = recorder;
      isListeningRef.current = true;
      setIsListening(true);
      setAiMessage("Listening…");
    } catch {
      setAiMessage("Mic access denied");
      setTimeout(() => setAiMessage(""), 2000);
    }
  }

  // ─── NEW: Suggestion renderer with icons & categories ───────────────────────

  function renderSuggestion(s: ScoredSuggestion) {
    const icons: Record<string, string> = {
      client: "👥",
      invoice: "🧾",
      calendar: "📅",
      project: "📊",
      task: "✅",
      payment: "💸",
      time: "⏱️",
      general: "⚡",
    };
    const icon = s.icon || icons[s.category] || "›";

    return (
      <div className="flex items-center gap-2 w-full">
        <span className="text-xs opacity-60 w-4 text-center">{icon}</span>
        <span className="flex-1 truncate">{s.label}</span>
        {s.source === "ai" && (
          <span className="text-[9px] px-1 py-0.5 rounded bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 font-medium">
            AI
          </span>
        )}
      </div>
    );
  }

  // ─── SHARED SUB-COMPONENTS ────────────────────────────────────────────────

  const InputRow = (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 p-2 flex items-center gap-2"
      onPointerDown={(e) => {
        // Clicking padding / empty space focuses the input
        const target = e.target as HTMLElement;
        if (
          target.closest("button") ||
          target.closest("input") ||
          target.closest("[data-freelanceos-command-input]")
        )
          return;
        setDockOpen(true);
        inputRef.current?.focus();
      }}
    >
      {/* Aria icon / spinner */}
      <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
        {loading ? (
          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle cx="12" cy="12" r="3" fill="white" />
            <path
              d="M12 2V6M12 18V22M2 12H6M18 12H22M5.05 5.05L7.88 7.88M16.12 16.12L18.95 18.95M5.05 18.95L7.88 16.12M16.12 7.88L18.95 5.05"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* Text input */}
      <input
        ref={inputRef}
        data-freelanceos-command-input
        aria-label="Command input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onFocus={() => setDockOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!dockOpen) setDockOpen(true);
            setSelectedIndex((prev) => {
              const next = prev + 1;
              return next >= instantSuggestions.length ? 0 : next;
            });
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSelectedIndex((prev) => {
              const next = prev - 1;
              return next < 0 ? instantSuggestions.length - 1 : next;
            });
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (selectedIndex >= 0 && instantSuggestions[selectedIndex]) {
              const s = instantSuggestions[selectedIndex];
              if (s.requiresInput) {
                setInput(s.label);
                inputRef.current?.focus();
                setSelectedIndex(-1);
              } else {
                handleSubmit(s.label);
              }
            } else {
              handleSubmit(input);
            }
          } else if (e.key === "Escape") {
            setInput("");
            setDockOpen(false);
            setSelectedIndex(-1);
            inputRef.current?.blur();
          }
        }}
        placeholder={
          workspaceMode
            ? "Projects & tasks — list projects · show tasks in … · put project X on hold"
            : "Ask anything… calendar · invoices · clients · type / to focus"
        }
        disabled={loading}
        className="flex-1 text-sm bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 disabled:opacity-50"
      />

      {/* Voice button */}
      <button
        type="button"
        onClick={startVoice}
        onPointerDown={(e) => e.stopPropagation()}
        disabled={loading}
        title={isListening ? "Stop listening" : "Voice command"}
        className={`hover:cursor-pointer flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${
          isListening
            ? "bg-red-500 text-white shadow-md shadow-red-500/40"
            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700"
        } disabled:opacity-40`}
      >
        {isListening ? (
          <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
            />
          </svg>
        )}
      </button>

      {/* Submit button */}
      <AnimatePresence>
        {input.trim() && !loading && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: "auto" }}
            exit={{ opacity: 0, scale: 0.8, width: 0 }}
            type="button"
            onClick={() => handleSubmit(input)}
            className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl transition-colors overflow-hidden whitespace-nowrap"
          >
            Go ↗
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  );

  // ─── NEW: Smart Suggestions Dock ────────────────────────────────────────────
  // Fixed height, categorized, instant 0ms filtering, AI-enhanced

  const SuggestionsDock = (
    <motion.div
      key="dock-suggestions"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="mt-2.5 h-[16rem] rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-1 py-1 shadow-sm overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 pb-1.5 flex-shrink-0 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          {input.trim() ? `Matches for "${input}"` : "Quick commands"}
        </p>
        <div className="flex items-center gap-1.5">
          {instantSuggestions.some((s) => s.source === "ai") && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 font-medium">
              ✨ AI hints
            </span>
          )}
        </div>
      </div>

      {/* Scrollable list */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        <Command shouldFilter={false} className="bg-transparent p-0 h-full">
          <CommandList className="max-h-none px-0">
            {instantSuggestions.length === 0 ? (
              <CommandEmpty className="text-[11px] text-zinc-400 px-2 pt-3 flex flex-col items-center gap-2">
                <span className="text-lg">🔍</span>
                <span>No matches — try a different keyword</span>
              </CommandEmpty>
            ) : (
              instantSuggestions.map((s, index) => (
                <CommandItem
                  key={s.id}
                  id={`cmd-suggestion-${index}`}
                  value={s.id}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onSelect={() => {
                    if (Date.now() < ignoreClicksUntil) return;
                    if (s.requiresInput) {
                      setInput(s.label);
                      inputRef.current?.focus();
                      setSelectedIndex(-1);
                    } else {
                      handleSubmit(s.label);
                    }
                  }}
                  className={`text-[11px] w-full max-w-none rounded-lg border-0 bg-transparent px-2 py-2.5 text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer ${
                    selectedIndex === index
                      ? "bg-zinc-100 dark:bg-zinc-800/80"
                      : "hover:bg-zinc-50/70 dark:hover:bg-zinc-800/40"
                  }`}
                >
                  {renderSuggestion(s)}
                </CommandItem>
              ))
            )}
          </CommandList>
        </Command>
      </div>

      {/* Footer hint */}
      <div className="flex-shrink-0 px-2 py-1.5 border-t border-zinc-100 dark:border-zinc-800">
        <p className="text-[9px] text-zinc-400 dark:text-zinc-500 text-center">
          {input.trim()
            ? "↑↓ to navigate · Enter to select · Esc to close"
            : "Type anything to search all commands"}
        </p>
      </div>
    </motion.div>
  );

  // Pill suggestions when dock is closed
  const PillSuggestions = useMemo(() => {
    // Show top 6 instant suggestions as pills when no input
    const pills = instantSuggestions
      .filter((s) => !s.requiresInput)
      .slice(0, 6)
      .map((s) => s.label);

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="flex gap-1.5 mt-3 flex-wrap justify-center"
      >
        {pills.map((s) => (
          <button
            key={s}
            onClick={() => handleSubmit(s)}
            className="text-xs px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 transition-all"
          >
            {s}
          </button>
        ))}
      </motion.div>
    );
  }, [instantSuggestions, handleSubmit]);

  const AiChip = aiMessage ? (
    <motion.div
      key="ai-msg"
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 2 }}
      transition={{ duration: 0.15 }}
      className="mb-2 text-center"
    >
      <span className="text-xs px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
        {aiMessage}
      </span>
    </motion.div>
  ) : null;

  // ─── BACKDROP ─────────────────────────────────────────────────────────────

  const Backdrop = (
    <AnimatePresence>
      {dockOpen && (
        <motion.button
          type="button"
          key="cmd-backdrop"
          aria-label="Dismiss command focus"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[80] bg-zinc-950/35 backdrop-blur-[3px] sm:backdrop-blur-sm cursor-default border-0 p-0 w-full"
          onClick={() => {
            setDockOpen(false);
            inputRef.current?.blur();
          }}
        />
      )}
    </AnimatePresence>
  );

  // ─── EMPTY / WELCOME STATE ────────────────────────────────────────────────

  if (isEmpty) {
    return (
      <>
        {Backdrop}

        <div className="fixed inset-0 z-[90] flex flex-col items-center justify-center px-4 gap-6 pointer-events-none">
          <AnimatePresence>
            {user && !dockOpen && (
              <motion.div
                key="welcome-text"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
                className="text-center pointer-events-none"
              >
                <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                  {greeting}, {user.firstName}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  What do you want to work on today?
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pointer-events-auto w-full max-w-xl" ref={dockRef}>
            <AnimatePresence>{AiChip}</AnimatePresence>
            {InputRow}

            <AnimatePresence>
              {dockOpen && !loading && SuggestionsDock}
            </AnimatePresence>

            <AnimatePresence>
              {!dockOpen && !input && !loading && PillSuggestions}
            </AnimatePresence>
          </div>
        </div>
      </>
    );
  }

  // ─── NORMAL (DOCKED) STATE ────────────────────────────────────────────────

  return (
    <>
      {Backdrop}

      <motion.div
        ref={dockRef}
        layout
        animate={{ y: dockOpen ? -32 : 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-[90] pointer-events-none"
      >
        <div className="pointer-events-auto w-full backdrop-blur-md bg-white/25 dark:bg-zinc-900/20 rounded-3xl px-3 py-2 border border-white/40 dark:border-zinc-700/50 shadow-sm">
          <AnimatePresence>{AiChip}</AnimatePresence>

          {/* Workspace action chips */}
          <AnimatePresence>
            {workspaceMode && workspaceChips && workspaceChips.length > 0 && (
              <motion.div
                key="ws-chips"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 2 }}
                className="mb-2 flex flex-wrap gap-1.5 justify-center"
              >
                {workspaceChips.map((c) => (
                  <button
                    key={c.payload + c.label}
                    type="button"
                    disabled={loading}
                    onClick={() => handleSubmit(c.payload)}
                    className="text-xs px-2.5 py-1 rounded-full bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-40 transition-colors"
                  >
                    {c.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {InputRow}

          <AnimatePresence>
            {dockOpen && !loading && SuggestionsDock}
          </AnimatePresence>

          <AnimatePresence>
            {!dockOpen && !input && !loading && PillSuggestions}
          </AnimatePresence>
        </div>
      </motion.div>
    </>
  );
}
