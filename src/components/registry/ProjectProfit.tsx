"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";

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

  return (
    <motion.div
      layoutId="ProjectProfit"
      className="bg-white border border-zinc-100 rounded-xl p-5"
    >
      <h2 className="text-lg font-semibold text-zinc-800 mb-4">
        Project Profitability
      </h2>
      <div className="space-y-3">
        {projects
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

            return (
              <div key={project.id} className="border rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-sm font-medium text-zinc-800">
                      {project.title}
                    </p>
                    <p className="text-[10px] text-zinc-400">
                      {project.clients?.name || "No client"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-800">
                      ₹{project.budget.toLocaleString("en-IN")}
                    </p>
                    <p className="text-[10px] text-zinc-400">budget</p>
                  </div>
                </div>
                <div className="w-full bg-zinc-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-violet-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-500">
                  <span>{progress}% complete</span>
                  <span>{totalHours}h logged</span>
                  <span
                    className={
                      hourlyRate > 0 ? "text-emerald-600 font-medium" : ""
                    }
                  >
                    {hourlyRate > 0 ? `₹${hourlyRate}/hr` : "No hours"}
                  </span>
                </div>
              </div>
            );
          })}
        {projects.filter((p) => p.budget).length === 0 && (
          <p className="text-sm text-zinc-400 text-center py-4">
            Add budgets to projects to see profitability
          </p>
        )}
      </div>
    </motion.div>
  );
}
