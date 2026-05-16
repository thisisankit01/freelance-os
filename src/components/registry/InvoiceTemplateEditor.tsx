"use client";

/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

type Template = {
  id: string;
  name: string;
  accent_color: string | null;
  payment_terms: string | null;
  footer_note: string | null;
  default_email_subject: string | null;
  default_email_message: string | null;
  is_default: boolean;
};

export function InvoiceTemplateEditor() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Template>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/invoice-templates");
    const json = await res.json().catch(() => ({}));
    setTemplates(json.data || []);
  }

  function startEdit(template: Template) {
    setEditingId(template.id);
    setDraft(template);
  }

  async function saveTemplate(id: string) {
    setSaving(true);
    await fetch("/api/invoice-templates", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        name: draft.name,
        accent_color: draft.accent_color,
        payment_terms: draft.payment_terms,
        footer_note: draft.footer_note,
        default_email_subject: draft.default_email_subject,
        default_email_message: draft.default_email_message,
      }),
    });
    setSaving(false);
    setEditingId(null);
    await load();
  }

  async function makeDefault(template: Template) {
    setSaving(true);
    await Promise.all(
      templates.map((t) =>
        fetch("/api/invoice-templates", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: t.id, is_default: t.id === template.id }),
        }),
      ),
    );
    setSaving(false);
    await load();
  }

  useEffect(() => {
    void load();
    const onRefresh = () => void load();
    window.addEventListener("soloos:templates-refresh", onRefresh);
    return () => window.removeEventListener("soloos:templates-refresh", onRefresh);
  }, []);

  return (
    <motion.div layoutId="InvoiceTemplateEditor" className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
        <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Invoice Templates</p>
        <p className="text-xs text-zinc-400">Branding, terms, and default email message</p>
      </div>
      <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {templates.map((t) => (
          <div key={t.id} className="px-5 py-3">
            {editingId === t.id ? (
              <div className="space-y-2">
                <input className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.name || ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Template name" />
                <div className="flex gap-2">
                  <input className="w-24 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.accent_color || ""} onChange={(e) => setDraft((d) => ({ ...d, accent_color: e.target.value }))} placeholder="#7c3aed" />
                  <input className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.payment_terms || ""} onChange={(e) => setDraft((d) => ({ ...d, payment_terms: e.target.value }))} placeholder="Payment terms" />
                </div>
                <input className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.default_email_subject || ""} onChange={(e) => setDraft((d) => ({ ...d, default_email_subject: e.target.value }))} placeholder="Email subject, e.g. Invoice {{invoiceNumber}}" />
                <textarea className="w-full min-h-20 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.default_email_message || ""} onChange={(e) => setDraft((d) => ({ ...d, default_email_message: e.target.value }))} placeholder="Email message. Supports {{clientName}}, {{invoiceNumber}}, {{total}}, {{freelancerName}}" />
                <input className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-transparent px-3 py-2 text-sm" value={draft.footer_note || ""} onChange={(e) => setDraft((d) => ({ ...d, footer_note: e.target.value }))} placeholder="Footer note" />
                <div className="flex gap-2 justify-end">
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800" onClick={() => setEditingId(null)} disabled={saving}>Cancel</button>
                  <button className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60" onClick={() => saveTemplate(t.id)} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full border border-zinc-200" style={{ background: t.accent_color || "#7c3aed" }} />
                  <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t.name}</p>
                  {t.is_default && <span className="text-[10px] px-2 py-0.5 rounded-full bg-violet-50 text-violet-600 dark:bg-violet-950/30 dark:text-violet-400">Default</span>}
                </div>
                <p className="text-xs text-zinc-400 mt-1 truncate">{t.default_email_subject || "No subject set"}</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">{t.default_email_message || "No default message set"}</p>
                <div className="flex gap-2 mt-3">
                  <button className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800" onClick={() => startEdit(t)}>Edit</button>
                  {!t.is_default && <button className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800" onClick={() => makeDefault(t)} disabled={saving}>Make default</button>}
                </div>
              </>
            )}
          </div>
        ))}
        {templates.length === 0 && <p className="text-sm text-zinc-400 p-5">No templates yet. Say &quot;create invoice template premium&quot;.</p>}
      </div>
    </motion.div>
  );
}
