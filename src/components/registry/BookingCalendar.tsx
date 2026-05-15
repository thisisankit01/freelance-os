"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useUser } from "@clerk/nextjs";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isToday,
  parseISO,
  addDays,
} from "date-fns";

type Appointment = {
  id: string;
  title: string;
  start_time: string;
  notes?: string;
  status: "scheduled" | "cancelled" | "completed";
  clients?: { id: string; name: string };
  source?: "native" | "google_calendar"; // Add this
};

type Client = { id: string; name: string };

type FormState = {
  title: string;
  clientId: string;
  date: string;
  time: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  clientId: "",
  date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
  time: "10:00",
  notes: "",
};

export function BookingCalendar() {
  const { user } = useUser();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);

  // Which appointment is selected (for detail / reschedule panel)
  const [selected, setSelected] = useState<Appointment | null>(null);

  // New appointment form
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Reschedule mode
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleTime, setRescheduleTime] = useState("");

  // Status banner
  const [status, setStatus] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  function flash(msg: string, type: "success" | "error" = "success") {
    setStatus({ msg, type });
    setTimeout(() => setStatus(null), 4000);
  }

  // ── Load clients for form dropdown ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from("clients")
      .select("id, name")
      .eq("user_id", user.id)
      .order("name", { ascending: true })
      .then(({ data }) => setClients(data || []));
  }, [user?.id]);

  // ── Load appointments ───────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const start = startOfMonth(currentMonth);
    const end = endOfMonth(currentMonth);

    const params = new URLSearchParams({
      startDate: start.toISOString(),
      endDate: end.toISOString(),
    });
    const res = await fetch(`/api/appointments?${params}`);
    const json = await res.json();
    const raw: Appointment[] = json.data || [];
    // Hide cancelled from the grid only; show scheduled + completed + Google sync
    setAppointments(
      raw.filter((a) => (a.status || "").toLowerCase() !== "cancelled"),
    );
    setLoading(false);
  }, [user?.id, currentMonth]);

  useEffect(() => {
    load();
  }, [load]);

  // Refetch when command bar finishes appointment mutations
  useEffect(() => {
    const onRefresh = () => {
      load();
    };
    window.addEventListener("soloos:appointments", onRefresh);
    return () => window.removeEventListener("soloos:appointments", onRefresh);
  }, [load]);

  // ── CRUD actions — all writes go via /api/appointments (service role key, bypasses RLS) ──
  async function createAppointment() {
    if (!form.title.trim() || !form.date || !form.time) return;
    setSaving(true);
    const startTime = new Date(`${form.date}T${form.time}:00`);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create",
        clientId: form.clientId || null,
        title: form.title.trim(),
        startTime: startTime.toISOString(),
        notes: form.notes || null,
      }),
    });
    const json = await res.json();
    setSaving(false);
    if (!res.ok) {
      flash(json.error, "error");
      return;
    }
    flash(`✓ "${form.title}" scheduled`);
    setShowForm(false);
    setForm(EMPTY_FORM);
    setCurrentMonth(startTime);
    load();
  }

  async function cancelAppointment(id: string) {
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "cancel", id }),
    });
    const json = await res.json();
    if (!res.ok) {
      flash(json.error || "Could not cancel", "error");
      return;
    }
    flash("✓ Appointment cancelled");
    setSelected(null);
    load();
  }

  async function reschedule(id: string) {
    if (!rescheduleDate || !rescheduleTime) return;
    const startTime = new Date(`${rescheduleDate}T${rescheduleTime}:00`);
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "reschedule",
        id,
        startTime: startTime.toISOString(),
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      flash(json.error, "error");
      return;
    }
    flash(`✓ Rescheduled to ${format(startTime, "MMM d, h:mm a")}`);
    setSelected(null);
    setRescheduling(false);
    load();
  }

  // ── Calendar grid ───────────────────────────────────────────────────────
  const days = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });
  const firstDayOfWeek = days[0].getDay();

  return (
    <motion.div
      layoutId="BookingCalendar"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {format(currentMonth, "MMMM yyyy")}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() =>
                setCurrentMonth(
                  (d) => new Date(d.getFullYear(), d.getMonth() - 1),
                )
              }
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              ←
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="text-xs px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
            >
              Today
            </button>
            <button
              onClick={() =>
                setCurrentMonth(
                  (d) => new Date(d.getFullYear(), d.getMonth() + 1),
                )
              }
              className="w-6 h-6 flex items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-sm transition-colors"
            >
              →
            </button>
          </div>
        </div>
        <button
          onClick={() => {
            setShowForm((f) => !f);
            setSelected(null);
          }}
          className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
        >
          {showForm ? "✕ Close" : "+ New"}
        </button>
      </div>

      {/* ── Status banner ── */}
      <AnimatePresence>
        {status && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={`px-5 py-2.5 text-xs font-medium overflow-hidden ${status.type === "success" ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"}`}
          >
            {status.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── New appointment form ── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-zinc-100 dark:border-zinc-800"
          >
            <div className="p-4 space-y-3 bg-zinc-50/50 dark:bg-zinc-800/30">
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                New Appointment
              </p>
              {/* Title */}
              <input
                placeholder="Title (e.g. Kickoff call with Rahul)"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
              />
              {/* Client + Date + Time row */}
              <div className="grid grid-cols-3 gap-2">
                <select
                  value={form.clientId}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, clientId: e.target.value }))
                  }
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                >
                  <option value="">— Client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, date: e.target.value }))
                  }
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                />
                <input
                  type="time"
                  value={form.time}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, time: e.target.value }))
                  }
                  className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all"
                />
              </div>
              {/* Notes */}
              <textarea
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                rows={2}
                className="w-full text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400 transition-all resize-none"
              />
              <button
                onClick={createAppointment}
                disabled={saving || !form.title.trim()}
                className="w-full text-sm bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {saving ? "Saving…" : "Schedule Appointment"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="p-4">
        {/* Day headers */}
        <div className="grid grid-cols-7 mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-medium text-zinc-400 dark:text-zinc-500 py-1"
            >
              {d}
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: 35 }).map((_, i) => (
              <div
                key={i}
                className="h-16 rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map((day) => {
              const dayAppts = appointments.filter((a) =>
                isSameDay(parseISO(a.start_time), day),
              );
              const today = isToday(day);
              return (
                <div
                  key={day.toISOString()}
                  className={`min-h-[72px] p-1.5 rounded-lg border transition-colors ${today ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200 dark:border-violet-700" : "border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"}`}
                >
                  <p
                    className={`text-[11px] font-semibold mb-1 ${today ? "text-violet-600 dark:text-violet-400" : "text-zinc-400 dark:text-zinc-500"}`}
                  >
                    {format(day, "d")}
                  </p>
                  <div className="space-y-0.5">
                    {dayAppts.map((appt) => (
                      <button
                        key={appt.id}
                        onClick={() => {
                          setSelected(appt);
                          setShowForm(false);
                        }}
                        className={`w-full text-left text-[10px] rounded px-1 py-0.5 truncate leading-tight transition-colors ${
                          appt.source === "google_calendar"
                            ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200"
                            : "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                        }`}
                      >
                        {appt.source === "google_calendar" && "🔗 "}
                        {format(parseISO(appt.start_time), "h:mm")}{" "}
                        {appt.clients?.name || appt.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Selected appointment detail panel ── */}
        <AnimatePresence>
          {selected && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="mt-4 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 space-y-3"
            >
              {/* Title + close */}
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    {selected.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {format(
                      parseISO(selected.start_time),
                      "EEEE, MMM d, yyyy · h:mm a",
                    )}
                    {selected.clients?.name && ` · ${selected.clients.name}`}
                  </p>
                  {selected.notes && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 italic">
                      "{selected.notes}"
                    </p>
                  )}
                  {selected.source === "google_calendar" && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 leading-relaxed">
                      Linked from Google Calendar — read-only here. To cancel or
                      reschedule, use Google Calendar.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setSelected(null);
                    setRescheduling(false);
                  }}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 text-lg leading-none flex-shrink-0"
                >
                  ×
                </button>
              </div>

              {/* Reschedule form */}
              {selected.source === "google_calendar" ? null : rescheduling ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    Pick new date & time
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="date"
                      defaultValue={format(
                        parseISO(selected.start_time),
                        "yyyy-MM-dd",
                      )}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="flex-1 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                    <input
                      type="time"
                      defaultValue={format(
                        parseISO(selected.start_time),
                        "HH:mm",
                      )}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1.5 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => reschedule(selected.id)}
                      className="flex-1 text-xs bg-violet-600 hover:bg-violet-700 text-white py-1.5 rounded-lg font-medium transition-colors"
                    >
                      Confirm reschedule
                    </button>
                    <button
                      onClick={() => setRescheduling(false)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setRescheduling(true);
                      setRescheduleDate(
                        format(parseISO(selected.start_time), "yyyy-MM-dd"),
                      );
                      setRescheduleTime(
                        format(parseISO(selected.start_time), "HH:mm"),
                      );
                    }}
                    className="flex-1 text-xs border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    📅 Reschedule
                  </button>
                  <button
                    onClick={() => cancelAppointment(selected.id)}
                    className="flex-1 text-xs bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 py-1.5 rounded-lg font-medium transition-colors"
                  >
                    🗑 Cancel
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Upcoming list (collapsed if detail panel open) ── */}
        {!loading && !selected && appointments.length > 0 && (
          <div className="mt-4 pt-4 border-t border-zinc-100 dark:border-zinc-800 space-y-1">
            <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500 mb-2">
              Upcoming this month
            </p>
            {appointments.slice(0, 4).map((appt) => (
              <button
                key={appt.id}
                onClick={() => {
                  setSelected(appt);
                  setRescheduling(false);
                }}
                className="w-full flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
              >
                <div className="w-1 h-7 rounded-full bg-violet-400 dark:bg-violet-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {appt.title}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {format(parseISO(appt.start_time), "EEEE, MMM d, yyyy")}
                    {appt.clients?.name && ` · ${appt.clients.name}`}
                  </p>
                </div>
                <span className="text-zinc-300 dark:text-zinc-600 text-sm flex-shrink-0">
                  ›
                </span>
              </button>
            ))}
          </div>
        )}

        {!loading && appointments.length === 0 && !showForm && (
          <div className="text-center py-8">
            <p className="text-sm text-zinc-400 dark:text-zinc-500">
              No appointments this month
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              + Schedule one now
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
