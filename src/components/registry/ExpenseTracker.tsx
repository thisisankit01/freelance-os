"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type Expense = {
  id: string;
  category: string;
  amount: number;
  gst_amount: number | null;
  date: string | null;
  description: string | null;
};

export function ExpenseTracker() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/expenses");
    const json = await res.json().catch(() => ({}));
    setExpenses(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:expenses-refresh", onRefresh);
    return () => window.removeEventListener("soloos:expenses-refresh", onRefresh);
  }, []);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const gst = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.gst_amount || 0), 0), [expenses]);

  if (loading) return <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-6">Loading expenses...</div>;

  return (
    <motion.div layoutId="ExpenseTracker" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Expenses</p>
          <p className="text-xs text-zinc-400">Monthly costs and GST input</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">₹{total.toLocaleString("en-IN")}</p>
          <p className="text-xs text-zinc-400">GST ₹{gst.toLocaleString("en-IN")}</p>
        </div>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {expenses.slice(0, 10).map((e) => (
          <div key={e.id} className="px-5 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{e.description || e.category}</p>
              <p className="text-xs text-zinc-400">{e.category}{e.date ? ` · ${new Date(e.date).toLocaleDateString("en-IN")}` : ""}</p>
            </div>
            <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">₹{e.amount.toLocaleString("en-IN")}</p>
          </div>
        ))}
        {expenses.length === 0 && <p className="text-sm text-zinc-400 p-5">No expenses yet. Say &quot;add expense software 999&quot;.</p>}
      </div>
    </motion.div>
  );
}
