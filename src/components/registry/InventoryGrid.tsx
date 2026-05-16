"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type InventoryItem = {
  id: string;
  item_name: string;
  quantity: number;
  unit_cost: number | null;
  low_stock_threshold: number;
  category: string | null;
};

export function InventoryGrid() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/inventory");
    const json = await res.json().catch(() => ({}));
    setItems(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:inventory-refresh", onRefresh);
    return () => window.removeEventListener("soloos:inventory-refresh", onRefresh);
  }, []);

  if (loading) return <div className="bg-white dark:bg-zinc-900 border dark:border-zinc-800 rounded-xl p-6">Loading inventory...</div>;

  return (
    <motion.div layoutId="InventoryGrid" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Inventory</p>
        <p className="text-xs text-zinc-400">Stock, cost, and low-stock alerts</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3 p-4">
        {items.map((item) => {
          const low = item.quantity <= item.low_stock_threshold;
          return (
            <div key={item.id} className="border border-zinc-100 dark:border-zinc-800 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{item.item_name}</p>
                  <p className="text-xs text-zinc-400">{item.category || "Uncategorized"}</p>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded-md border ${low ? "border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300" : "border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
                  {low ? "Low" : "OK"}
                </span>
              </div>
              <div className="mt-3 flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Qty {item.quantity}</span>
                <span>Alert {item.low_stock_threshold}</span>
                <span>{item.unit_cost ? `₹${item.unit_cost.toLocaleString("en-IN")}` : "No cost"}</span>
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="text-sm text-zinc-400 p-4">No inventory yet. Say &quot;add inventory camera quantity 2&quot;.</p>}
      </div>
    </motion.div>
  );
}
