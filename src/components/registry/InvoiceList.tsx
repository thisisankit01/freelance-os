/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { InvoicePDF } from "./InvoicePDF";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { pdf } from "@react-pdf/renderer";
import { useUser } from "@clerk/nextjs";

const STATUS_STYLES: Record<string, string> = {
  draft:
    "border-violet-100 bg-violet-50 text-violet-600 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300",
  sent:
    "border-indigo-100 bg-indigo-50 text-indigo-600 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300",
  paid:
    "border-emerald-100 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300",
  overdue:
    "border-rose-100 bg-rose-50 text-rose-600 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300",
};

export function InvoiceList() {
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);
  const [emailState, setEmailState] = useState<
    Record<string, "idle" | "sending" | "sent" | "error">
  >({});
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { filters } = useStore();
  const { user: freelancer } = useUser();

  async function loadInvoiceDetails(invoiceId: string) {
    // Toggle off if already open
    if (invoiceDetails?.id === invoiceId) {
      setInvoiceDetails(null);
      return;
    }
    setLoadingDetail(invoiceId);
    const { data } = await supabase
      .from("invoices")
      .select(
        "*, invoice_items(*), clients(*), users(name, email, business_name, gstin)",
      )
      .eq("id", invoiceId)
      .single();
    setInvoiceDetails(data);
    setLoadingDetail(null);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function emailInvoice(invoice: any) {
    if (!invoice.clients?.email) {
      setEmailState((s) => ({ ...s, [invoice.id]: "error" }));
      setTimeout(
        () => setEmailState((s) => ({ ...s, [invoice.id]: "idle" })),
        3000,
      );
      return;
    }

    setEmailState((s) => ({ ...s, [invoice.id]: "sending" }));

    try {
      // Generate PDF on the client where React runtime is available
      const blob = await pdf(
        <InvoicePDF
          invoice={invoiceDetails}
          client={invoiceDetails.clients}
          freelancerName={
            freelancer?.fullName ??
            `${freelancer?.firstName ?? ""} ${freelancer?.lastName ?? ""}`.trim()
          }
          freelancerEmail={freelancer?.emailAddresses[0]?.emailAddress ?? ""}
        />,
      ).toBlob();

      // Convert blob to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: invoice.clients.email,
          subject: `Invoice ${invoice.invoice_number} from SoloOS`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoice_number,
          pdfBase64: base64, // send the pre-rendered PDF
        }),
      });

      const data = await res.json();
      setEmailState((s) => ({
        ...s,
        [invoice.id]: data.success ? "sent" : "error",
      }));
    } catch {
      setEmailState((s) => ({ ...s, [invoice.id]: "error" }));
    } finally {
      setTimeout(
        () => setEmailState((s) => ({ ...s, [invoice.id]: "idle" })),
        3000,
      );
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setInvoiceDetails(null);

    async function load() {
      let query = supabase
        .from("invoices")
        .select("*, clients(name)")
        .order("created_at", { ascending: false });

      if (filters.status) query = query.eq("status", filters.status);

      const { data } = await query;
      setInvoices(data || []);
      setLoading(false);
    }

    load();
  }, [filters]);

  return (
    <motion.div
      layoutId="InvoiceList"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {loading ? (
            <span className="text-zinc-400">Loading…</span>
          ) : (
            <>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                {invoices.length}
              </span>
              {" invoices"}
            </>
          )}
        </p>
        {!loading && filters.status && (
          <span className="text-[11px] px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/30 text-violet-600 dark:text-violet-300 border border-violet-100 dark:border-violet-900">
            {filters.status}
          </span>
        )}
      </div>

      {/* Skeleton */}
      {loading && (
        <div>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-5 py-3.5 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
            >
              <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-24 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-2.5 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
              </div>
              <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && invoices.length === 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="px-6 py-10 flex flex-col items-center text-center gap-3"
        >
          <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl">
            🧾
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              No invoices found
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              Type &quot;create invoice&quot; to make one
            </p>
          </div>
        </motion.div>
      )}

      {/* Invoice rows */}
      <AnimatePresence>
        {!loading &&
          invoices.map((inv, i) => (
            <motion.div
              key={inv.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.03 }}
              className="border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
            >
              {/* Main row */}
              <div className="flex items-center gap-3 px-5 py-3.5 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                {/* Avatar */}
                <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xs font-semibold text-violet-700 dark:text-violet-300 flex-shrink-0">
                  {inv.invoice_number?.slice(-2) || "IN"}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">
                    {inv.invoice_number}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 truncate">
                    {inv.clients?.name || "Unknown client"}
                  </p>
                </div>

                {/* Amount + status */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    ₹{inv.total?.toLocaleString("en-IN")}
                  </p>
                  <span
                    className={`px-2 py-0.5 rounded-md border text-[11px] font-medium capitalize ${STATUS_STYLES[inv.status] || STATUS_STYLES.draft}`}
                  >
                    {inv.status}
                  </span>
                </div>

                {/* View toggle */}
                <button
                  onClick={() => loadInvoiceDetails(inv.id)}
                  disabled={loadingDetail === inv.id}
                  className="text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 font-medium transition-colors flex-shrink-0 disabled:opacity-50"
                >
                  {loadingDetail === inv.id
                    ? "…"
                    : invoiceDetails?.id === inv.id
                      ? "Close"
                      : "View"}
                </button>
              </div>

              {/* Expanded: PDF download strip */}
              <AnimatePresence>
                {invoiceDetails?.id === inv.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center justify-between px-5 py-3 bg-violet-50 dark:bg-violet-900/20 border-t border-violet-100 dark:border-violet-800/50 gap-3">
                      <div className="text-xs text-violet-700 dark:text-violet-300 space-y-0.5 flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {inv.invoice_number}
                        </p>
                        <p className="text-violet-500 dark:text-violet-400 truncate">
                          {inv.clients?.name} · ₹
                          {inv.total?.toLocaleString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {/* Email button */}
                        {(() => {
                          const es = emailState[inv.id] ?? "idle";
                          return (
                            <button
                              onClick={() => emailInvoice(invoiceDetails)}
                              disabled={es === "sending"}
                              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 ${
                                es === "sent"
                                  ? "bg-emerald-500 text-white"
                                  : es === "error"
                                    ? "bg-red-500 text-white"
                                    : "bg-white dark:bg-zinc-800 border border-violet-200 dark:border-violet-700 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30"
                              }`}
                            >
                              {es === "sending"
                                ? "Sending…"
                                : es === "sent"
                                  ? "✓ Sent!"
                                  : es === "error"
                                    ? invoiceDetails.clients?.email
                                      ? "✕ Failed"
                                      : "No email"
                                    : "✉ Send Email"}
                            </button>
                          );
                        })()}

                        {/* PDF download */}
                        <PDFDownloadLink
                          document={
                            <InvoicePDF
                              invoice={invoiceDetails}
                              client={invoiceDetails.clients}
                              freelancerName={
                                freelancer?.fullName ??
                                `${freelancer?.firstName ?? ""} ${freelancer?.lastName ?? ""}`.trim()
                              }
                              freelancerEmail={
                                freelancer?.emailAddresses[0]?.emailAddress ??
                                ""
                              }
                            />
                          }
                          fileName={`${inv.invoice_number}.pdf`}
                        >
                          {({ loading: pdfLoading }) => (
                            <button
                              className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-50"
                              disabled={pdfLoading}
                            >
                              {pdfLoading ? "Preparing…" : "⬇ Download PDF"}
                            </button>
                          )}
                        </PDFDownloadLink>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
      </AnimatePresence>
    </motion.div>
  );
}
