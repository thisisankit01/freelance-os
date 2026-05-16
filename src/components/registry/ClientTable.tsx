'use client'

import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Pencil, Plus, Sparkles, Trash2, Upload, Users, X, type LucideIcon } from 'lucide-react'
import { useStore } from '@/lib/store'
import { Client } from '@/types'
import { Badge } from '@/components/ui/badge'

type ClientDraft = {
    id?: string
    name: string
    email: string
    phone: string
    company: string
    city: string
    status: 'active' | 'inactive'
    notes: string
    selected?: boolean
    reason?: string
}

const EMPTY_DRAFT: ClientDraft = {
    name: '',
    email: '',
    phone: '',
    company: '',
    city: '',
    status: 'active',
    notes: '',
    selected: true,
}

function toDraft(client?: Partial<ClientDraft | Client>): ClientDraft {
    return {
        id: typeof client?.id === 'string' ? client.id : undefined,
        name: client?.name ?? '',
        email: client?.email ?? '',
        phone: client?.phone ?? '',
        company: client?.company ?? '',
        city: client?.city ?? '',
        status: client?.status === 'inactive' ? 'inactive' : 'active',
        notes: client?.notes ?? '',
        selected: true,
    }
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join('') || 'CL'
}

export function ClientTable() {
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const [importOpen, setImportOpen] = useState(false)
    const [mode, setMode] = useState<'manual' | 'ai' | 'google'>('manual')
    const [pasteText, setPasteText] = useState('')
    const [drafts, setDrafts] = useState<ClientDraft[]>([EMPTY_DRAFT])
    const [editing, setEditing] = useState<ClientDraft | null>(null)
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [saving, setSaving] = useState(false)
    const [message, setMessage] = useState<string | null>(null)
    const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null)
    const [mounted, setMounted] = useState(false)
    const [googleContacts, setGoogleContacts] = useState<ClientDraft[]>([])
    const [googleQuery, setGoogleQuery] = useState('')
    const { filters, emptyMessage, selectClient, setComponents } = useStore()

    const load = useCallback(async () => {
        setLoading(true)
        const params = new URLSearchParams()
        if (filters.status) params.set('status', filters.status)
        if (filters.city) params.set('city', filters.city)
        if (filters.search) params.set('search', filters.search)
        const res = await fetch(`/api/clients?${params}`)
        const json = await res.json().catch(() => ({}))
        setClients(Array.isArray(json.data) ? json.data : [])
        setLoading(false)
    }, [filters.city, filters.search, filters.status])

    useEffect(() => {
        const mountId = setTimeout(() => setMounted(true), 0)
        const id = setTimeout(() => void load(), 0)
        const onRefresh = () => void load()
        const onImport = (event: Event) => {
            const detail = (event as CustomEvent<{ mode?: typeof mode }>).detail
            resetImport(detail?.mode ?? 'ai')
            if (detail?.mode === 'google') void importGoogleContacts()
        }
        window.addEventListener('soloos:clients-refresh', onRefresh)
        window.addEventListener('soloos:open-client-import', onImport)
        return () => {
            clearTimeout(mountId)
            clearTimeout(id)
            window.removeEventListener('soloos:clients-refresh', onRefresh)
            window.removeEventListener('soloos:open-client-import', onImport)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])

    function openClient(id: string) {
        selectClient(id)
        setComponents(['StatsBar', 'ClientCard'])
    }

    function filterLabel() {
        const parts: string[] = []
        if (filters.status) parts.push(filters.status)
        if (filters.city) parts.push(`in ${filters.city}`)
        if (filters.search) parts.push(`matching "${filters.search}"`)
        return parts.length > 0 ? `clients ${parts.join(' ')}` : 'clients'
    }

    function resetImport(nextMode: typeof mode = 'manual') {
        setMode(nextMode)
        setPasteText('')
        setDrafts([EMPTY_DRAFT])
        setGoogleContacts([])
        setGoogleQuery('')
        setMessage(null)
        setImportOpen(true)
    }

    async function parseWithAi() {
        if (!pasteText.trim()) return
        setSaving(true)
        const res = await fetch('/api/clients/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: pasteText }),
        })
        const json = await res.json().catch(() => ({}))
        const rows = Array.isArray(json.data) ? json.data.map(toDraft) : []
        setDrafts(rows.length ? rows : [EMPTY_DRAFT])
        setSaving(false)
    }

    async function importGoogleContacts() {
        setSaving(true)
        setMode('google')
        setMessage(null)
        const res = await fetch('/api/google/contacts')
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
            setMessage(json.error || 'Could not load Google Contacts.')
            setSaving(false)
            return
        }
        const rows = Array.isArray(json.data) ? json.data.map(toDraft) : []
        setGoogleContacts(rows)
        setDrafts([])
        setMessage(rows.length ? 'Search your Google Contacts and add only the clients you want.' : 'No Google contacts found.')
        setSaving(false)
    }

    function addGoogleContact(contact: ClientDraft) {
        setDrafts((rows) => {
            const existing = rows.some((row) =>
                (contact.email && row.email.toLowerCase() === contact.email.toLowerCase()) ||
                row.name.toLowerCase() === contact.name.toLowerCase(),
            )
            return existing ? rows : [...rows, { ...contact, selected: true }]
        })
        setMessage('Added to review list. Save when ready.')
    }

    function updateDraft(index: number, patch: Partial<ClientDraft>) {
        setDrafts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
    }

    async function saveDrafts() {
        const rows = drafts.filter((draft) => draft.selected !== false && draft.name.trim())
        if (!rows.length) {
            setMessage('Select at least one client with a name.')
            return
        }
        setSaving(true)
        const res = await fetch('/api/clients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clients: rows, mode: 'skip_duplicates' }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
            setMessage(json.error || 'Could not save clients.')
        } else {
            const created = Array.isArray(json.created) ? json.created.length : 0
            const skipped = Array.isArray(json.skipped) ? json.skipped.length : 0
            setMessage(`Imported ${created} client${created === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}.`)
            await load()
            window.dispatchEvent(new Event('soloos:clients-refresh'))
            setTimeout(() => setImportOpen(false), 900)
        }
        setSaving(false)
    }

    async function saveEdit() {
        if (!editing?.id || !editing.name.trim()) return
        setSaving(true)
        const res = await fetch('/api/clients', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(editing),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) setMessage(json.error || 'Could not update client.')
        else {
            setEditing(null)
            await load()
        }
        setSaving(false)
    }

    async function bulkStatus(status: 'active' | 'inactive') {
        const ids = Array.from(selectedIds)
        if (!ids.length) return
        setSaving(true)
        await fetch('/api/clients', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, updates: { status } }),
        })
        setSelectedIds(new Set())
        await load()
        setSaving(false)
    }

    async function deleteClients(ids: string[]) {
        setSaving(true)
        const res = await fetch('/api/clients', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) setMessage(json.error || 'Could not delete clients. Archive them if they have invoices/projects.')
        else {
            setSelectedIds(new Set())
            setConfirmDelete(null)
            await load()
        }
        setSaving(false)
    }

    const totalPending = clients.reduce((sum, client) => sum + ((client.total_billed || 0) - (client.total_paid || 0)), 0)
    const googleMatches = googleContacts
        .filter((contact) => {
            const q = googleQuery.trim().toLowerCase()
            if (!q) return false
            return [contact.name, contact.email, contact.phone, contact.company, contact.city]
                .filter(Boolean)
                .some((value) => value.toLowerCase().includes(q))
        })
        .slice(0, 12)

    return (
        <motion.div
            layout
            className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden"
        >
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {loading ? (
                                <span className="text-zinc-400">Loading...</span>
                            ) : (
                                <>
                                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">{clients.length}</span>{' '}
                                    {filterLabel()}
                                </>
                            )}
                        </p>
                        {!loading && clients.length > 0 && (
                            <p className="text-xs text-zinc-400 mt-0.5">
                                ₹{totalPending.toLocaleString('en-IN')} pending across this view
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {(filters.city || filters.status || filters.search) && (
                            <div className="flex gap-1.5">
                                {filters.city && <Badge variant="default">City {filters.city}</Badge>}
                                {filters.status && <Badge variant="secondary">{filters.status}</Badge>}
                                {filters.search && <Badge variant="outline">Search {filters.search}</Badge>}
                            </div>
                        )}
                        <button
                            onClick={() => resetImport('manual')}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 transition-colors"
                        >
                            <Plus className="h-3.5 w-3.5" />
                            Add
                        </button>
                        <button
                            onClick={() => resetImport('ai')}
                            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40 transition-colors"
                        >
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Import
                        </button>
                    </div>
                </div>
                {selectedIds.size > 0 && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 dark:border-violet-900 dark:bg-violet-950/25">
                        <p className="text-xs text-violet-700 dark:text-violet-300">{selectedIds.size} selected</p>
                        <div className="flex gap-2">
                            <button onClick={() => bulkStatus('active')} className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:text-violet-300">Active</button>
                            <button onClick={() => bulkStatus('inactive')} className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-100 dark:border-violet-900 dark:text-violet-300">Archive</button>
                            <button onClick={() => setConfirmDelete({ ids: Array.from(selectedIds), label: `${selectedIds.size} selected clients` })} className="text-xs px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300">Delete</button>
                        </div>
                    </div>
                )}
            </div>

            {loading && (
                <div>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                            <div className="w-8 h-8 rounded-full bg-violet-50 dark:bg-violet-950/30 animate-pulse" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                                <div className="h-2.5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {!loading && clients.length === 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-6 py-10 flex flex-col items-center text-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900 flex items-center justify-center text-violet-600 dark:text-violet-300">
                        <Users className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {emptyMessage || 'No real clients yet'}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                            Import from Google Contacts, paste a WhatsApp/email list, or add one manually.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => resetImport('ai')} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700">
                            <Sparkles className="h-3.5 w-3.5" />
                            Start Import
                        </button>
                    </div>
                </motion.div>
            )}

            <AnimatePresence>
                {!loading && clients.map((client) => (
                    <motion.div
                        key={client.id}
                        layoutId={`client-row-${client.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3 px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-violet-50/40 dark:hover:bg-violet-950/10 last:border-0 transition-colors"
                    >
                        <input
                            type="checkbox"
                            checked={selectedIds.has(client.id)}
                            onChange={(e) => {
                                const next = new Set(selectedIds)
                                if (e.target.checked) next.add(client.id)
                                else next.delete(client.id)
                                setSelectedIds(next)
                            }}
                            className="h-4 w-4 accent-violet-600"
                            aria-label={`Select ${client.name}`}
                        />
                        <button onClick={() => openClient(client.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                            <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-950/35 border border-violet-100 dark:border-violet-900 flex items-center justify-center text-xs font-medium text-violet-700 dark:text-violet-300 flex-shrink-0">
                                {initials(client.name)}
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{client.name}</p>
                                <p className="text-xs text-zinc-500 truncate">
                                    {[client.company, client.city, client.email].filter(Boolean).join(' · ') || 'No contact details yet'}
                                </p>
                            </div>
                        </button>
                        <div className="hidden sm:block text-right">
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                ₹{((client.total_billed || 0) - (client.total_paid || 0)).toLocaleString('en-IN')}
                            </p>
                            <p className="text-xs text-zinc-400">pending</p>
                        </div>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>{client.status}</Badge>
                        <button onClick={() => setEditing(toDraft(client))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/40" aria-label={`Edit ${client.name}`}>
                            <Pencil className="h-3.5 w-3.5" />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>

            {mounted && importOpen ? createPortal(
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 px-3 backdrop-blur-sm">
                    <div className="w-full max-w-5xl max-h-[90vh] overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4 dark:border-zinc-800">
                            <div>
                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Add Real Clients</p>
                                <p className="text-xs text-zinc-500">Paste, import, review, then save. Nothing is added until you confirm.</p>
                            </div>
                            <button onClick={() => setImportOpen(false)} className="p-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="grid md:grid-cols-[260px_minmax(0,1fr)] max-h-[calc(90vh-73px)] overflow-hidden">
                            <div className="border-b md:border-b-0 md:border-r border-zinc-100 dark:border-zinc-800 p-4 space-y-2">
                                {([
                                    { key: 'manual', icon: Plus, label: 'Manual add' },
                                    { key: 'ai', icon: Sparkles, label: 'Paste + AI' },
                                    { key: 'google', icon: Upload, label: 'Google Contacts' },
                                ] satisfies Array<{ key: typeof mode; icon: LucideIcon; label: string }>).map(({ key, icon: LucideIcon, label }) => {
                                    const typedKey = key
                                    return (
                                        <button
                                            key={key}
                                            onClick={() => {
                                                setMode(typedKey)
                                                if (typedKey === 'google') void importGoogleContacts()
                                            }}
                                            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs transition-colors ${mode === typedKey ? 'bg-violet-600 text-white' : 'border border-violet-100 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300 dark:hover:bg-violet-950/35'}`}
                                        >
                                            <LucideIcon className="h-3.5 w-3.5" />
                                            {label}
                                        </button>
                                    )
                                })}
                                <p className="pt-2 text-xs leading-5 text-zinc-500">
                                    Best path: search Google Contacts for known clients, or paste a list from WhatsApp, Gmail, spreadsheet, or notes.
                                </p>
                                {message && <p className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">{message}</p>}
                            </div>
                            <div className="min-h-0 overflow-y-auto p-4">
                                {mode === 'ai' && (
                                    <div className="mb-4">
                                        <textarea
                                            value={pasteText}
                                            onChange={(e) => setPasteText(e.target.value)}
                                            placeholder="Paste contacts from anywhere: Rahul Sharma rahul@email.com +91..., Priya from Mumbai, Acme Corp..."
                                            className="h-28 w-full resize-none rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                        />
                                        <div className="mt-2 flex justify-end">
                                            <button onClick={parseWithAi} disabled={saving || !pasteText.trim()} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                                                <Sparkles className="h-3.5 w-3.5" />
                                                Extract Clients
                                            </button>
                                        </div>
                                    </div>
                                )}
                                {mode === 'google' && (
                                    <div className="mb-4 space-y-3">
                                        <div>
                                            <input
                                                value={googleQuery}
                                                onChange={(e) => setGoogleQuery(e.target.value)}
                                                placeholder="Search Google Contacts by name, email, company, phone..."
                                                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
                                            />
                                            <p className="mt-1 text-xs text-zinc-400">
                                                We only add contacts you choose here. Your Google Contacts are not edited.
                                            </p>
                                        </div>
                                        {saving && <p className="text-xs text-zinc-400">Loading contacts...</p>}
                                        {!saving && googleQuery.trim() && googleMatches.length === 0 && (
                                            <p className="rounded-lg border border-violet-100 bg-violet-50 px-3 py-2 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
                                                No matching Google Contacts.
                                            </p>
                                        )}
                                        <div className="space-y-2">
                                            {googleMatches.map((contact, index) => (
                                                <div key={`${contact.email || 'no-email'}-${contact.phone || 'no-phone'}-${contact.name || 'no-name'}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800">
                                                    <div className="min-w-0">
                                                        <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">{contact.name || contact.email}</p>
                                                        <p className="truncate text-xs text-zinc-500">
                                                            {[contact.company, contact.email, contact.phone].filter(Boolean).join(' · ')}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => addGoogleContact(contact)}
                                                        className="shrink-0 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700"
                                                    >
                                                        Add
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-2">
                                    {drafts.map((draft, index) => (
                                        <div key={index} className="grid gap-2 rounded-lg border border-zinc-100 p-3 dark:border-zinc-800 md:grid-cols-[auto_1.2fr_1.2fr_1fr_1fr_auto]">
                                            <input type="checkbox" checked={draft.selected !== false} onChange={(e) => updateDraft(index, { selected: e.target.checked })} className="mt-2 h-4 w-4 accent-violet-600" />
                                            <input value={draft.name} onChange={(e) => updateDraft(index, { name: e.target.value })} placeholder="Name" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                            <input value={draft.email} onChange={(e) => updateDraft(index, { email: e.target.value })} placeholder="Email" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                            <input value={draft.phone} onChange={(e) => updateDraft(index, { phone: e.target.value })} placeholder="Phone" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                            <input value={draft.city} onChange={(e) => updateDraft(index, { city: e.target.value })} placeholder="City" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                            <button onClick={() => setDrafts((rows) => rows.filter((_, i) => i !== index))} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                            <input value={draft.company} onChange={(e) => updateDraft(index, { company: e.target.value })} placeholder="Company" className="md:col-start-2 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                            <input value={draft.notes} onChange={(e) => updateDraft(index, { notes: e.target.value })} placeholder="Notes" className="md:col-span-3 rounded-lg border border-zinc-200 px-2 py-1.5 text-xs outline-none focus:border-violet-400 dark:border-zinc-800 dark:bg-zinc-950" />
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-4 flex justify-between gap-2">
                                    <button onClick={() => setDrafts((rows) => [...rows, EMPTY_DRAFT])} className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
                                        Add row
                                    </button>
                                    <button onClick={saveDrafts} disabled={saving} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                                        <Check className="h-3.5 w-3.5" />
                                        {saving ? 'Saving...' : 'Save Clients'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}

            {mounted && editing ? createPortal(
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-zinc-950/50 px-3 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Edit Client</p>
                                <p className="text-xs text-zinc-500">Keep the details clean so AI can use them later.</p>
                            </div>
                            <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {(['name', 'email', 'phone', 'company', 'city'] as const).map((field) => (
                                <input key={field} value={editing[field]} onChange={(e) => setEditing({ ...editing, [field]: e.target.value })} placeholder={field} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950" />
                            ))}
                            <select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as 'active' | 'inactive' })} className="rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950">
                                <option value="active">Active</option>
                                <option value="inactive">Inactive</option>
                            </select>
                            <textarea value={editing.notes} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Notes" className="sm:col-span-2 h-20 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20 dark:border-zinc-800 dark:bg-zinc-950" />
                        </div>
                        <div className="mt-4 flex justify-between">
                            <button onClick={() => setConfirmDelete({ ids: editing.id ? [editing.id] : [], label: editing.name })} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-300">
                                <Trash2 className="h-3.5 w-3.5" />
                                Delete
                            </button>
                            <button onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                                <Check className="h-3.5 w-3.5" />
                                Save
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}

            {mounted && confirmDelete ? createPortal(
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/50 px-3 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-950">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delete clients?</p>
                        <p className="mt-1 text-xs leading-5 text-zinc-500">
                            This will delete {confirmDelete.label}. If a client has invoices or projects, deletion may be blocked. Archive is safer for real client history.
                        </p>
                        {message && <p className="mt-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">{message}</p>}
                        <div className="mt-5 flex justify-end gap-2">
                            <button onClick={() => setConfirmDelete(null)} className="text-xs px-3 py-1.5 rounded-lg border border-violet-200 text-violet-700 hover:bg-violet-50 dark:border-violet-900 dark:text-violet-300">Cancel</button>
                            <button onClick={() => deleteClients(confirmDelete.ids)} disabled={saving} className="text-xs px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            ) : null}
        </motion.div>
    )
}
