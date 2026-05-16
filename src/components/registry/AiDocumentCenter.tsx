"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Send, Sparkles, X } from "lucide-react";

type AiDocument = {
  id: string;
  document_type: "contract" | "legal_notice";
  title: string;
  status: string;
  content: string;
  recipient_email: string | null;
  clients?: { name: string; email: string | null } | null;
  projects?: { title: string } | null;
  invoices?: { invoice_number: string } | null;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/javascript:/gi, "");
}

function markdownToHtml(markdown: string) {
  const escaped = escapeHtml(markdown);
  return escaped
    .replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br />");
}

function renderPreviewHtml(value: string) {
  const hasHtml = /<\/?[a-z][\s\S]*>/i.test(value);
  const html = hasHtml ? sanitizeHtml(value) : `<p>${markdownToHtml(value)}</p>`;
  return { __html: html };
}

export function AiDocumentCenter() {
  const [docs, setDocs] = useState<AiDocument[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AiDocument | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [polishing, setPolishing] = useState(false);

  async function load() {
    const res = await fetch("/api/ai-documents");
    const json = await res.json().catch(() => ({}));
    setDocs(json.data || []);
  }

  async function sendDocument(doc: AiDocument) {
    const email = doc.recipient_email || doc.clients?.email;
    if (!email) return;
    const warning = doc.document_type === "legal_notice" ? " This is a legal notice and may have legal consequences." : "";
    if (!window.confirm(`Send "${doc.title}" to ${email}?${warning}`)) return;
    setSendingId(doc.id);
    await fetch("/api/ai-documents/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: doc.id }),
    });
    setSendingId(null);
    await load();
    setSelected(null);
  }

  async function saveDocument() {
    if (!selected) return;
    const res = await fetch("/api/ai-documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, title: selected.title, content: draftContent }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json.data) {
      setSelected(json.data);
      await load();
    }
  }

  async function polishDocument() {
    if (!selected) return;
    setPolishing(true);
    const res = await fetch("/api/ai-polish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field: selected.document_type === "legal_notice" ? "legal notice draft" : "contract draft",
        text: draftContent,
        context: `Client: ${selected.clients?.name || "Not assigned"}\nProject: ${selected.projects?.title || "Not assigned"}\nInvoice: ${selected.invoices?.invoice_number || "None"}`,
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && typeof json.text === "string") setDraftContent(json.text);
    setPolishing(false);
  }

  function openDocument(doc: AiDocument) {
    setSelected(doc);
    setDraftContent(doc.content);
  }

  const pages = draftContent
    ? draftContent.match(/[\s\S]{1,1800}/g) || [draftContent]
    : [""];

  const canSendSelected = Boolean(selected && selected.status !== "sent" && (selected.recipient_email || selected.clients?.email));

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:documents-refresh", onRefresh);
    return () => window.removeEventListener("soloos:documents-refresh", onRefresh);
  }, []);

  return (
    <motion.div layoutId="AiDocumentCenter" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Contracts & Legal Notices</p>
        <p className="text-xs text-zinc-400">AI drafts saved before sending</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {docs.map((d) => (
          <button key={d.id} onClick={() => openDocument(d)} className="w-full text-left px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{d.title}</p>
                <p className="text-xs text-zinc-400 capitalize">{d.document_type.replace("_", " ")} · {d.clients?.name || d.recipient_email || "No recipient"}</p>
              </div>
              <div className="flex items-center gap-2 h-fit">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500">{d.status}</span>
                {d.status !== "sent" && (d.recipient_email || d.clients?.email) && (
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white">
                    {sendingId === d.id ? "Sending..." : "Send"}
                  </span>
                )}
              </div>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-2 line-clamp-2">{d.content}</p>
          </button>
        ))}
        {docs.length === 0 && <p className="text-sm text-zinc-400 p-5">No documents yet. Say &quot;draft contract for Rahul&quot;.</p>}
      </div>
      {selected && (
        <div className="fixed inset-0 z-[120] bg-zinc-950/70 backdrop-blur-sm p-3 md:p-6">
          <div className="h-full max-w-7xl mx-auto bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-2xl flex flex-col">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <input
                  value={selected.title}
                  onChange={(e) => setSelected((s) => s ? { ...s, title: e.target.value } : s)}
                  className="w-full max-w-xl rounded-lg border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-zinc-900 outline-none hover:border-zinc-200 focus:border-violet-300 dark:text-zinc-100 dark:focus:border-violet-800"
                />
                <p className="text-xs text-zinc-500">
                  {selected.clients?.name || selected.recipient_email || "No recipient"} · {selected.projects?.title || selected.invoices?.invoice_number || "Draft"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={polishDocument} disabled={polishing} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40 disabled:opacity-60">
                  <Sparkles className="h-3.5 w-3.5" />
                  {polishing ? "Improving..." : "Improve"}
                </button>
                <button onClick={saveDocument} className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40">
                  Save
                </button>
                <button onClick={async () => { await saveDocument(); if (selected) await sendDocument(selected); }} disabled={!canSendSelected || sendingId === selected.id} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                  <Send className="h-3.5 w-3.5" />
                  Send PDF
                </button>
                <button onClick={() => setSelected(null)} className="p-2 rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="grid md:grid-cols-[minmax(0,1fr)_360px] flex-1 min-h-0">
              <div className="p-4 md:p-6 min-h-0">
                <textarea
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  className="h-full min-h-[520px] w-full resize-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-5 py-4 text-sm leading-6 text-zinc-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                />
              </div>
              <div className="border-t md:border-t-0 md:border-l border-zinc-100 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 p-4 overflow-y-auto">
                <p className="text-xs font-medium text-zinc-500 mb-3">Page preview</p>
                <div className="space-y-4">
                  {pages.map((page, index) => (
                    <div key={index} className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-sm min-h-[460px] rounded-sm p-5">
                      <p className="text-[10px] text-zinc-400 mb-3">Page {index + 1}</p>
                      <div
                        className="prose-preview text-[11px] leading-5 text-zinc-700 dark:text-zinc-200"
                        dangerouslySetInnerHTML={renderPreviewHtml(page)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
