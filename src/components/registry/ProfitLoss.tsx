"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

type Invoice = { total: number | null; status: string; created_at: string | null };
type Expense = { amount: number; date: string | null; category?: string | null };

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const pnlChartConfig = {
  revenue: { label: "Revenue", color: "#7c3aed" },
  expenses: { label: "Expenses", color: "#ef4444" },
  profit: { label: "Profit", color: "#22c55e" },
} satisfies ChartConfig;

const categoryChartConfig = {
  amount: { label: "Amount", color: "#7c3aed" },
} satisfies ChartConfig;

function monthKey(value: string | null | undefined) {
  if (!value) return "Unscheduled";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unscheduled";
  return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

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
      const { data } = await supabase.from("invoices").select("total, status, created_at");
      setInvoices(data || []);
    });
  }, []);

  const revenue = useMemo(() => invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total || 0), 0), [invoices]);
  const cost = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const profit = revenue - cost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;

  const monthlyData = useMemo(() => {
    const map = new Map<string, { month: string; revenue: number; expenses: number; profit: number }>();
    const ensure = (month: string) => {
      if (!map.has(month)) map.set(month, { month, revenue: 0, expenses: 0, profit: 0 });
      return map.get(month)!;
    };
    invoices
      .filter((invoice) => invoice.status === "paid")
      .forEach((invoice) => {
        ensure(monthKey(invoice.created_at)).revenue += Number(invoice.total || 0);
      });
    expenses.forEach((expense) => {
      ensure(monthKey(expense.date)).expenses += Number(expense.amount || 0);
    });
    return Array.from(map.values()).map((row) => ({
      ...row,
      profit: row.revenue - row.expenses,
    }));
  }, [expenses, invoices]);

  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    expenses.forEach((expense) => {
      const category = expense.category || "Other";
      map.set(category, (map.get(category) || 0) + Number(expense.amount || 0));
    });
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [expenses]);

  return (
    <motion.div layoutId="ProfitLoss" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Profit & Loss</h2>
          <p className="text-xs text-zinc-400 mt-0.5">Revenue, cost, margin, and expense mix</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-zinc-400">Margin</p>
          <p className={`text-lg font-semibold ${profit >= 0 ? "text-violet-600 dark:text-violet-400" : "text-red-500"}`}>{margin}%</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-lg border border-violet-100 bg-violet-50/60 dark:border-violet-950 dark:bg-violet-950/20 p-3">
          <p className="text-xs text-violet-600 dark:text-violet-400">Revenue</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{INR.format(revenue)}</p>
        </div>
        <div className="rounded-lg border border-red-100 bg-red-50/60 dark:border-red-950 dark:bg-red-950/20 p-3">
          <p className="text-xs text-red-600 dark:text-red-400">Expenses</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{INR.format(cost)}</p>
        </div>
        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 dark:border-emerald-950 dark:bg-emerald-950/20 p-3">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">Profit</p>
          <p className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">{INR.format(profit)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.8fr)] gap-4">
        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Monthly performance</p>
            <p className="text-xs text-zinc-400">Paid revenue against operating costs</p>
          </div>
          <ChartContainer config={pnlChartConfig} className="h-[280px] aspect-auto">
            <AreaChart data={monthlyData} margin={{ left: 4, right: 10, top: 10 }}>
              <defs>
                <linearGradient id="profitLossRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#7c3aed" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="month" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Number(value) / 1000}k`} width={42} />
              <ChartTooltip content={<ChartTooltipContent valueFormatter={(value) => INR.format(Number(value))} />} />
              <Area type="monotone" dataKey="revenue" stroke="#7c3aed" fill="url(#profitLossRevenue)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" fill="#ef44441A" strokeWidth={2} />
              <Area type="monotone" dataKey="profit" stroke="#22c55e" fill="#22c55e12" strokeWidth={2} />
            </AreaChart>
          </ChartContainer>
        </div>

        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3">
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Expense categories</p>
            <p className="text-xs text-zinc-400">Where money is going</p>
          </div>
          <ChartContainer config={categoryChartConfig} className="h-[280px] aspect-auto">
            <BarChart data={categoryData} layout="vertical" margin={{ left: 10, right: 12 }}>
              <CartesianGrid horizontal={false} />
              <XAxis type="number" hide />
              <YAxis dataKey="category" type="category" tickLine={false} axisLine={false} width={82} />
              <ChartTooltip content={<ChartTooltipContent valueFormatter={(value) => INR.format(Number(value))} />} />
              <Bar dataKey="amount" radius={[0, 6, 6, 0]} fill="#7c3aed" />
            </BarChart>
          </ChartContainer>
        </div>
      </div>
    </motion.div>
  );
}
