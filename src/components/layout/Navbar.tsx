"use client";

import { motion } from "framer-motion";
import { UserButton } from "@clerk/nextjs";
import { useTimerStore } from "@/lib/timer-store";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  CalendarClock,
  FileText,
  HelpCircle,
  Receipt,
  Sparkles,
  Timer,
  Users,
  X,
} from "lucide-react";

const HELP_SECTIONS = [
  {
    title: "Chat Control",
    icon: Sparkles,
    description:
      "Use natural language. SoloOS can open screens, create records, edit data, ask follow-up questions, and require confirmation for risky actions.",
    commands: [
      "what can you do",
      "show my workspace",
      "how is my business performing",
      "open finance dashboard",
      "where am i losing money",
      "yes",
      "cancel",
    ],
  },
  {
    title: "Client Onboarding",
    icon: Users,
    description:
      "Add one client, import many clients, search Google Contacts, paste from WhatsApp/Gmail/sheets, edit, archive, delete, and filter real clients.",
    commands: [
      "add client Rahul email rahul@example.com",
      "import clients",
      "import Google contacts",
      "find Rahul",
      "show active clients",
      "clients in Mumbai",
      "edit client Rahul",
      "archive client Rahul",
      "delete client Rahul",
    ],
  },
  {
    title: "Projects & Tasks",
    icon: Timer,
    description:
      "Create and manage projects, deadlines, budgets, client assignment, task status, task details, mobile-friendly status changes, and timers.",
    commands: [
      "show my projects",
      "create project Website Redesign for Rahul",
      "edit project Website Redesign",
      "assign Website Redesign client Rahul",
      "set Website Redesign budget to 50000",
      "set Website Redesign deadline to 2026-06-30",
      "move Website Redesign to review",
      "what projects are behind schedule",
      "add task homepage to Website Redesign",
      "rename task homepage to landing page",
      "set task homepage estimate to 4",
      "set task homepage due to 2026-06-30",
      "finish homepage task",
      "start timer for homepage",
      "stop timer",
    ],
  },
  {
    title: "Invoices & Templates",
    icon: Receipt,
    description:
      "Create, open, email, mark paid/sent/overdue, customize invoice template, default template, subject, message, terms, footer, and color.",
    commands: [
      "show invoices",
      "create invoice for Rahul 5000",
      "show invoice INV-001",
      "mark invoice INV-001 paid",
      "email invoice INV-001",
      "show invoice templates",
      "create invoice template Premium",
      "make Premium template default",
      "set template message",
    ],
  },
  {
    title: "Contracts & Notices",
    icon: FileText,
    description:
      "Draft contracts and legal notices using client, project, task, invoice, and business context. Edit in wide modal, preview pages, save drafts, send PDF with confirmation.",
    commands: [
      "draft contract for Rahul project Website Redesign",
      "draft legal notice for Rahul invoice INV-001",
      "show contracts",
      "show legal notices",
      "send contract to Rahul",
      "send saved legal notice to Rahul",
    ],
  },
  {
    title: "Calendar & Reminders",
    icon: CalendarClock,
    description:
      "Schedule appointments, show meetings, cancel calls, send reminders, and email both client and logged-in user after confirmation.",
    commands: [
      "schedule call with Rahul tomorrow 4pm",
      "remind Rahul about tomorrow call",
      "show appointments",
      "cancel tomorrow call with Rahul",
    ],
  },
  {
    title: "Finance & Insights",
    icon: BarChart3,
    description:
      "Open the finance dashboard, read revenue vs expenses, P&L charts, project profitability, effective hourly rate, and business performance.",
    commands: [
      "show revenue vs expenses",
      "show profit and loss",
      "where am i losing money",
      "which project has best hourly rate",
      "show project profitability",
      "how much did I earn per hour on Website Redesign",
    ],
  },
  {
    title: "Inventory & Expenses",
    icon: Receipt,
    description:
      "Track stock levels, low-stock alerts, product quantities, categories, unit costs, expenses, GST amount, and monthly costs.",
    commands: [
      "show inventory",
      "show low stock",
      "add inventory camera quantity 2",
      "set battery stock to 8",
      "show expenses",
      "add expense software 999",
      "show travel costs",
    ],
  },
  {
    title: "Team & Payouts",
    icon: Users,
    description:
      "Manage team members, subcontractors, roles, task ownership, work assignments, payout records, and money owed to people.",
    commands: [
      "show team",
      "add team member Aman designer",
      "assign homepage task to Aman",
      "show assignments",
      "show payouts",
      "add payout Aman 5000",
    ],
  },
  {
    title: "Payments",
    icon: Receipt,
    description:
      "Prepare payment links for invoices and review provider setup status. Razorpay live creation and webhook auto-paid are provider integration steps.",
    commands: [
      "show payment links",
      "create payment link for invoice INV-001",
      "show invoice payment status",
    ],
  },
  {
    title: "Safety Rules",
    icon: HelpCircle,
    description:
      "Sending emails, reminders, documents, payment-like changes, and destructive actions require confirmation so serious actions are not fired accidentally.",
    commands: [
      "confirm",
      "go ahead",
      "cancel",
      "undo last",
      "show pending confirmation",
    ],
  },
];

export function Navbar() {
  const activeEntry = useTimerStore((s) => s.activeEntry);
  const elapsed = useTimerStore((s) => s.elapsed);
  const isRunning = useTimerStore((s) => s.isRunning);
  const syncWithServer = useTimerStore((s) => s.syncWithServer);
  const stopTimer = useTimerStore((s) => s.stopTimer);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpPrompt, setHelpPrompt] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const mountId = window.setTimeout(() => setMounted(true), 0);
    syncWithServer();

    const interval = window.setInterval(() => {
      syncWithServer();
    }, 30000);

    const onVisible = () => {
      if (document.visibilityState === "visible") syncWithServer();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearTimeout(mountId);
      window.clearInterval(interval);
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
      window.dispatchEvent(new Event("soloos:time-refresh"));
    }
  }

  function runCommand(prompt: string) {
    const clean = prompt.trim();
    if (!clean) return;
    window.dispatchEvent(
      new CustomEvent("soloos:run-command", { detail: { prompt: clean } }),
    );
    setHelpPrompt("");
    setHelpOpen(false);
  }

  return (
    <>
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
            SoloOS
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
          <button
            onClick={() => setHelpOpen(true)}
            className="inline-flex h-7 items-center gap-1 rounded-lg border border-violet-200 px-2 text-[11px] font-medium text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40"
          >
            <HelpCircle className="h-3 w-3" />
            <span className="hidden sm:inline">Help</span>
          </button>
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
      {mounted && helpOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[160] flex items-start justify-center bg-zinc-950/45 px-3 py-20 backdrop-blur-sm sm:py-24"
              onClick={() => setHelpOpen(false)}
            >
              <div className="w-full max-w-5xl overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-violet-950/10 dark:border-zinc-800 dark:bg-zinc-950">
                <div
                  onClick={(event) => event.stopPropagation()}
                >
                <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      What can SoloOS do?
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      Click a working command or ask what you need in plain language.
                    </p>
                  </div>
                  <button
                    onClick={() => setHelpOpen(false)}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40"
                    aria-label="Close help"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="border-b border-zinc-100 px-4 py-3 dark:border-zinc-800">
                  <div className="flex gap-2 rounded-xl border border-violet-100 bg-violet-50/70 px-2 py-1.5 dark:border-violet-900 dark:bg-violet-950/25">
                    <form
                      className="flex min-w-0 flex-1 items-center gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        runCommand(helpPrompt);
                      }}
                    >
                      <input
                        value={helpPrompt}
                        onChange={(event) => setHelpPrompt(event.target.value)}
                        placeholder="Ask for help or type a command..."
                        className="h-7 min-w-0 flex-1 bg-transparent text-xs text-zinc-800 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
                      />
                      <button
                        type="submit"
                        disabled={!helpPrompt.trim()}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-40"
                        aria-label="Run command"
                      >
                        ↗
                      </button>
                    </form>
                  </div>
                </div>

                <div className="max-h-[60vh] overflow-y-auto p-4">
                  <div className="grid gap-3 lg:grid-cols-2">
                    {HELP_SECTIONS.map(({ title, icon: Icon, description, commands }) => (
                      <div
                        key={title}
                        className="rounded-xl border border-zinc-100 bg-zinc-50/70 p-3.5 dark:border-zinc-800 dark:bg-zinc-900/60"
                      >
                        <div className="mb-3 flex items-start gap-2.5">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-violet-100 bg-white text-violet-700 dark:border-violet-900 dark:bg-zinc-950 dark:text-violet-300">
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">
                              {title}
                            </p>
                            <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                              {description}
                            </p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {commands.map((command) => (
                            <button
                              key={command}
                              onClick={() => runCommand(command)}
                              className="rounded-md border border-violet-100 bg-white px-2 py-1 text-left text-[10px] leading-4 text-violet-700 transition-colors hover:bg-violet-50 dark:border-violet-900 dark:bg-zinc-950 dark:text-violet-300 dark:hover:bg-violet-950/40"
                            >
                              {command}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 text-xs leading-5 text-violet-800 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-200">
                    Tip: you do not need exact wording. Say the intent naturally,
                    like “send Rahul the contract” or “where is money leaking?”
                    and SoloOS will choose the closest supported workflow.
                  </div>
                </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
