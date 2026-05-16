"use client";

import * as React from "react";
import * as RechartsPrimitive from "recharts";

import { cn } from "@/lib/utils";

export type ChartConfig = {
  [key: string]: {
    label?: React.ReactNode;
    color?: string;
  };
};

const ChartContext = React.createContext<{ config: ChartConfig } | null>(null);

function useChart() {
  const context = React.useContext(ChartContext);
  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />");
  }
  return context;
}

function ChartContainer({
  id,
  className,
  children,
  config,
  ...props
}: React.ComponentProps<"div"> & {
  config: ChartConfig;
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"];
}) {
  const uniqueId = React.useId();
  const chartId = `chart-${id || uniqueId.replace(/:/g, "")}`;

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        data-chart={chartId}
        className={cn(
          "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-zinc-500 [&_.recharts-grid_line]:stroke-zinc-200/70 [&_.recharts-tooltip-cursor]:fill-violet-50 dark:[&_.recharts-cartesian-axis-tick_text]:fill-zinc-400 dark:[&_.recharts-grid_line]:stroke-zinc-800 dark:[&_.recharts-tooltip-cursor]:fill-violet-950/30",
          className,
        )}
        {...props}
      >
        <RechartsPrimitive.ResponsiveContainer>
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  );
}

function ChartTooltipContent({
  active,
  payload,
  label,
  className,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey?: string | number;
    name?: string | number;
    value?: number | string;
    color?: string;
  }>;
  label?: string | number;
  className?: string;
  valueFormatter?: (value: number | string) => string;
}) {
  const { config } = useChart();

  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "min-w-32 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-zinc-800 dark:bg-zinc-950",
        className,
      )}
    >
      {label && (
        <p className="mb-1.5 font-medium text-zinc-800 dark:text-zinc-100">
          {label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((item) => {
          const key = String(item.dataKey || item.name || "");
          const itemConfig = config[key];
          const color = item.color || itemConfig?.color || "#7c3aed";
          const value =
            typeof item.value === "number" || typeof item.value === "string"
              ? item.value
              : "";

          return (
            <div
              key={key}
              className="flex min-w-0 items-center justify-between gap-3"
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="text-zinc-500 dark:text-zinc-400">
                  {itemConfig?.label || item.name || key}
                </span>
              </div>
              <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                {valueFormatter ? valueFormatter(value) : value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const ChartTooltip = RechartsPrimitive.Tooltip;
const ChartLegend = RechartsPrimitive.Legend;

export { ChartContainer, ChartTooltip, ChartTooltipContent, ChartLegend };
