"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  XAxis,
  YAxis,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const projectChartConfig = {
  budget: { label: "Budget", color: "#7c3aed" },
  hourlyRate: { label: "Effective hourly", color: "#22c55e" },
} satisfies ChartConfig;

export function ProjectProfit() {
  const { user } = useUser();
  const [projects, setProjects] = useState<
    {
      id: string;
      title: string;
      budget: number;
      tasks: { id: string; status: string; actual_hours: number }[];
      clients?: { name: string };
    }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const res = await fetch("/api/projects");
      const json = await res.json();
      setProjects(json.data || []);
      setLoading(false);
    }
    if (user?.id) load();
  }, [user?.id]);

  if (loading)
    return (
      <div className="bg-white border rounded-xl p-8 animate-pulse">
        Loading...
      </div>
    );

  const profitableProjects = projects
    .filter((p) => p.budget)
    .map((project) => {
      const totalHours =
        project.tasks?.reduce(
          (sum: number, t: { actual_hours: number }) =>
            sum + (t.actual_hours || 0),
          0,
        ) || 0;
      const hourlyRate =
        totalHours > 0 ? Math.round(project.budget / totalHours) : 0;
      const progress =
        project.tasks?.length > 0
          ? Math.round(
              (project.tasks.filter(
                (t: { status: string }) => t.status === "done",
              ).length /
                project.tasks.length) *
                100,
            )
          : 0;

      return {
        ...project,
        totalHours,
        hourlyRate,
        progress,
        shortTitle:
          project.title.length > 16
            ? `${project.title.slice(0, 14)}...`
            : project.title,
      };
    });

  return (
    <motion.div
      layoutId="ProjectProfit"
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">
            Project Profitability
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Budget, tracked hours, completion, and effective hourly rate
          </p>
        </div>
      </div>

      {profitableProjects.length > 0 && (
        <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 p-3 mb-4">
          <div className="mb-3">
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Budget by project</p>
            <p className="text-xs text-zinc-400">Purple bars use your project budgets</p>
          </div>
          <ChartContainer config={projectChartConfig} className="h-[280px] aspect-auto">
            <BarChart data={profitableProjects} margin={{ top: 18, right: 12, left: 6 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="shortTitle" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} tickFormatter={(value) => `₹${Number(value) / 1000}k`} width={42} />
              <ChartTooltip content={<ChartTooltipContent valueFormatter={(value) => INR.format(Number(value))} />} />
              <Bar dataKey="budget" fill="#7c3aed" radius={[6, 6, 0, 0]}>
                <LabelList dataKey="progress" position="top" formatter={(value) => `${Number(value || 0)}%`} className="fill-zinc-500 text-[10px]" />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
      )}

      <div className="space-y-3">
        {profitableProjects.map((project) => (
              <div key={project.id} className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      {project.title}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {project.clients?.name || "No client"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {INR.format(project.budget)}
                    </p>
                    <p className="text-[10px] text-zinc-400">budget</p>
                  </div>
                </div>
                <div className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-full h-2 mb-2">
                  <div
                    className="bg-violet-600 h-2 rounded-full transition-all"
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{project.progress}% complete</span>
                  <span>{project.totalHours}h logged</span>
                  <span
                    className={
                      project.hourlyRate > 0 ? "text-emerald-600 font-medium" : ""
                    }
                  >
                    {project.hourlyRate > 0 ? `${INR.format(project.hourlyRate)}/hr` : "No hours"}
                  </span>
                </div>
              </div>
            ))}
        {profitableProjects.length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">
            Add budgets to projects to see profitability
          </p>
        )}
      </div>
    </motion.div>
  );
}
