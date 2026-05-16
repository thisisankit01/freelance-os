"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";

type Invoice = { total: number | null; status: string };
type Expense = { amount: number };

export function ProfitLoss() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/expenses").then((r) => r.json()).catch(() => ({})),
      fetch("/api/projects").then((r) => r.json()).catch(() => ({})),
    ]).then(async ([expenseJson]) => {
      setExpenses(expenseJson.data || []);
      const { supabase } = await import("@/lib/supabase");
      const { data } = await supabase.from("invoices").select("total, status");
      setInvoices(data || []);
    });
  }, []);

  const revenue = useMemo(() => invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total || 0), 0), [invoices]);
  const cost = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const profit = revenue - cost;

  return (
    <motion.div layoutId="ProfitLoss" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5">
      <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200 mb-4">Profit & Loss</h2>
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Revenue</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">₹{revenue.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg bg-red-50 dark:bg-red-950/20 p-3">
          <p className="text-xs text-red-600 dark:text-red-400">Expenses</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">₹{cost.toLocaleString("en-IN")}</p>
        </div>
        <div className="rounded-lg bg-violet-50 dark:bg-violet-950/20 p-3">
          <p className="text-xs text-violet-600 dark:text-violet-400">Profit</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">₹{profit.toLocaleString("en-IN")}</p>
        </div>
      </div>
    </motion.div>
  );
}
