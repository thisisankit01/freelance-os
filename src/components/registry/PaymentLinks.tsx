"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type PaymentLink = {
  id: string;
  url: string | null;
  amount: number | null;
  status: string | null;
  provider: string;
  invoices?: { invoice_number: string; clients?: { name: string } | null } | null;
};

export function PaymentLinks() {
  const [links, setLinks] = useState<PaymentLink[]>([]);

  async function load() {
    const res = await fetch("/api/payment-links");
    const json = await res.json().catch(() => ({}));
    setLinks(json.data || []);
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:payment-links-refresh", onRefresh);
    return () => window.removeEventListener("soloos:payment-links-refresh", onRefresh);
  }, []);

  return (
    <motion.div layoutId="PaymentLinks" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Payment Links</p>
        <p className="text-xs text-zinc-400">Razorpay/UPI payment requests</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {links.map((l) => (
          <div key={l.id} className="px-5 py-3 flex justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{l.invoices?.invoice_number || l.provider}</p>
              <p className="text-xs text-zinc-400 truncate">{l.url || "Provider link pending"}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{l.amount ? `₹${l.amount.toLocaleString("en-IN")}` : ""}</p>
              <p className="text-xs text-zinc-400">{l.status || "created"}</p>
            </div>
          </div>
        ))}
        {links.length === 0 && <p className="text-sm text-zinc-400 p-5">No payment links yet. Razorpay keys are needed for live links.</p>}
      </div>
    </motion.div>
  );
}
