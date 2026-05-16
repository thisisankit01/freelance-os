import type { ParsedPmCommand } from '@/lib/pm-command-parser'
import { mapProjectStatus, mapTaskStatus } from '@/lib/pm-command-parser'
import { usePmChatStore } from '@/lib/pm-chat-store'
import { useStore } from '@/lib/store'
import { createInvoiceViaAi, emailInvoiceViaAi } from '@/lib/invoice-ai-actions'
import { supabase } from '@/lib/supabase'

type ProjectRow = {
    id: string
    title: string
    description?: string | null
    status?: string
    deadline?: string | null
    budget?: number | null
    client_id?: string | null
    clients?: { id: string; name: string } | null
    tasks?: { id: string; status: string; actual_hours?: number | null }[]
}
type TaskRow = {
    id: string
    title: string
    status: string
    project_id: string
    estimated_hours?: number | null
    due_date?: string | null
    projects?: { id: string; title: string }
}
type InvoiceRow = {
    id: string
    invoice_number: string
    status: string
    total?: number | null
    clients?: { id?: string; name?: string | null; email?: string | null } | null
}
type AppointmentRow = {
    id: string
    title: string
    start_time: string
    status?: string
    clients?: { id?: string; name?: string | null; email?: string | null } | null
}
type AiDocumentRow = {
    id: string
    title: string
    document_type: 'contract' | 'legal_notice'
    status: string
    recipient_email?: string | null
    clients?: { id?: string; name?: string | null; email?: string | null } | null
    projects?: { id?: string; title?: string | null } | null
}
type InvoiceTemplateRow = {
    id: string
    name: string
    is_default?: boolean | null
}

function scoreMatch(query: string, title: string) {
    const q = query.toLowerCase().trim()
    const t = title.toLowerCase().trim()
    if (!q) return 0
    if (t === q) return 100
    if (t.startsWith(q)) return 90
    if (t.includes(q)) return 75
    const parts = q.split(/\s+/).filter((p) => p.length > 1)
    if (parts.length && parts.every((p) => t.includes(p))) return 55
    return 0
}

/** Edit distance for typo-tolerant project matching (titles are short). */
function levenshtein(a: string, b: string): number {
    const m = a.length
    const n = b.length
    if (!n) return m
    if (!m) return n
    const prev = new Array<number>(n + 1)
    const cur = new Array<number>(n + 1)
    for (let j = 0; j <= n; j++) prev[j] = j
    for (let i = 1; i <= m; i++) {
        cur[0] = i
        const ca = a.charCodeAt(i - 1)
        for (let j = 1; j <= n; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
            cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
        }
        for (let j = 0; j <= n; j++) prev[j] = cur[j]!
    }
    return prev[n]!
}

/** Rank projects when the query is garbled or misspelled — nearest titles first. */
function fuzzyRankProjects(query: string, projects: ProjectRow[]): { p: ProjectRow; score: number }[] {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return projects
        .map((p) => {
            const t = p.title.toLowerCase().trim()
            let score = scoreMatch(query, p.title)
            if (score < 70) {
                const maxLen = Math.max(q.length, t.length, 1)
                const levFull = Math.round(100 * (1 - levenshtein(q, t) / maxLen))
                const words = t.split(/\s+/).filter((w) => w.length > 0)
                let levWord = 0
                for (const w of words) {
                    const mw = Math.max(q.length, w.length, 1)
                    levWord = Math.max(levWord, Math.round(100 * (1 - levenshtein(q, w) / mw)))
                }
                const prefix =
                    q.length >= 2 && t.startsWith(q.slice(0, Math.min(4, q.length))) ? 42 : 0
                score = Math.max(score, levFull, Math.round(levWord * 0.95), prefix)
            }
            return { p, score }
        })
        .sort((a, b) => b.score - a.score)
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
    on_hold: 'On Hold',
}

const ALLOWED_PROJECT_STATUS = new Set(['not_started', 'in_progress', 'review', 'done', 'on_hold'])

function pickProjectForStatusCommand(
    parsed: Extract<ParsedPmCommand, { kind: 'set_project_status' }>,
    projects: ProjectRow[],
    store: ReturnType<typeof usePmChatStore.getState>,
):
    | { ok: true; project: ProjectRow }
    | { ok: false; reason: 'no_current' }
    | { ok: false; reason: 'none' }
    | { ok: false; reason: 'fuzzy'; candidates: ProjectRow[] }
    | { ok: false; reason: 'ambiguous'; matches: ProjectRow[] } {
    const ref = parsed.projectRef
    if (ref.kind === 'id') {
        const p = projects.find((x) => x.id === ref.id)
        return p ? { ok: true, project: p } : { ok: false, reason: 'none' }
    }
    if (ref.kind === 'current') {
        const id = store.taskBoardProjectId || store.lastMentionedProjectId
        if (!id) return { ok: false, reason: 'no_current' }
        const p = projects.find((x) => x.id === id)
        return p ? { ok: true, project: p } : { ok: false, reason: 'none' }
    }
    const name = ref.name
    const matches = projects.filter((p) => scoreMatch(name, p.title) > 0)
    if (matches.length === 0) {
        const ranked = fuzzyRankProjects(name, projects).filter((x) => x.score >= 42).slice(0, 6).map((x) => x.p)
        if (ranked.length > 0) return { ok: false, reason: 'fuzzy', candidates: ranked }
        return { ok: false, reason: 'none' }
    }
    if (matches.length > 1) {
        return { ok: false, reason: 'ambiguous', matches: matches.slice(0, 4) }
    }
    return { ok: true, project: matches[0]! }
}

function pickBestProject(name: string, projects: ProjectRow[]): ProjectRow | null {
    const ranked = projects
        .map((p) => ({ p, s: scoreMatch(name, p.title) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
    return ranked[0]?.p ?? null
}

type TaskResolve =
    | { ok: true; task: TaskRow }
    | { ok: false; reason: 'none' }
    | { ok: false; reason: 'ambiguous'; candidates: TaskRow[] }

/** When two matches are close in score, ask the user to pick a task. */
function resolveTaskMatch(title: string, tasks: TaskRow[]): TaskResolve {
    if (title === '__last__') {
        const id = usePmChatStore.getState().lastMentionedTaskId
        const t = id ? tasks.find((x) => x.id === id) : undefined
        return t ? { ok: true, task: t } : { ok: false, reason: 'none' }
    }
    const ranked = tasks
        .map((t) => ({ t, s: scoreMatch(title, t.title) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
    if (ranked.length === 0) return { ok: false, reason: 'none' }
    const top = ranked[0]!
    if (ranked.length === 1) return { ok: true, task: top.t }
    const second = ranked[1]!
    const tight = top.s < 100 && top.s - second.s < 12
    if (tight) {
        const minS = second.s
        const candidates = ranked.filter((x) => x.s >= minS - 1).slice(0, 6).map((x) => x.t)
        return { ok: false, reason: 'ambiguous', candidates }
    }
    return { ok: true, task: top.t }
}

export type RunnerResult = {
    reply: string
    chips?: { label: string; payload: string }[]
}

async function apiProjects(): Promise<ProjectRow[]> {
    const res = await fetch('/api/projects')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load projects')
    return json.data || []
}

async function apiTasks(projectId?: string | null): Promise<TaskRow[]> {
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    const res = await fetch(`/api/tasks?${params}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load tasks')
    return json.data || []
}

async function findTaskById(id: string): Promise<TaskRow | null> {
    const tasks = await apiTasks(null)
    return tasks.find((t) => t.id === id) ?? null
}

async function resolveClientId(name: string): Promise<string | null> {
    const q = name.trim()
    if (!q) return null
    const { data } = await supabase.from('clients').select('id, name').ilike('name', `%${q}%`).limit(1)
    return data?.[0]?.id ?? null
}

async function resolveClient(name: string): Promise<{ id: string; name: string; email?: string | null } | null> {
    const q = name.trim()
    if (!q) return null
    const { data } = await supabase.from('clients').select('id, name, email').ilike('name', `%${q}%`).limit(1)
    return (data?.[0] as { id: string; name: string; email?: string | null } | undefined) ?? null
}

function documentTitle(type: 'contract' | 'legal_notice', clientName?: string, projectTitle?: string) {
    if (type === 'legal_notice') return `Legal notice${clientName ? ` for ${clientName}` : ''}`
    return `Contract${clientName ? ` for ${clientName}` : ''}${projectTitle ? ` - ${projectTitle}` : ''}`
}

async function findInvoice(params: { invoiceNumber?: string; clientName?: string }): Promise<InvoiceRow | null> {
    let query = supabase
        .from('invoices')
        .select('id, invoice_number, status, total, clients(id, name, email)')
        .order('created_at', { ascending: false })
        .limit(1)

    if (params.invoiceNumber) {
        query = query.ilike('invoice_number', params.invoiceNumber)
    } else if (params.clientName) {
        const clientId = await resolveClientId(params.clientName)
        if (!clientId) return null
        query = query.eq('client_id', clientId)
    } else {
        return null
    }

    const { data } = await query
    return (data?.[0] as InvoiceRow | undefined) ?? null
}

async function findNextAppointment(clientName?: string): Promise<AppointmentRow | null> {
    const res = await fetch('/api/appointments')
    const json = await res.json().catch(() => ({}))
    const rows = Array.isArray(json.data) ? (json.data as AppointmentRow[]) : []
    const now = Date.now()
    const q = clientName?.trim().toLowerCase()
    const upcoming = rows
        .filter((a) => (a.status ?? 'scheduled') === 'scheduled')
        .filter((a) => new Date(a.start_time).getTime() >= now - 5 * 60 * 1000)
        .filter((a) => {
            if (!q) return true
            return (
                a.clients?.name?.toLowerCase().includes(q) ||
                a.title.toLowerCase().includes(q)
            )
        })
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    return upcoming[0] ?? null
}

async function apiJson(path: string, init?: RequestInit) {
    const res = await fetch(path, {
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(json.error || res.statusText)
    return json
}

async function findTeamMember(name: string): Promise<{ id: string; name: string } | null> {
    const json = await apiJson('/api/team-members')
    const rows = Array.isArray(json.data) ? (json.data as { id: string; name: string }[]) : []
    return rows.find((m) => scoreMatch(name, m.name) > 0) ?? null
}

async function findInventoryItem(name: string): Promise<{ id: string; item_name: string } | null> {
    const json = await apiJson('/api/inventory')
    const rows = Array.isArray(json.data) ? (json.data as { id: string; item_name: string }[]) : []
    return rows.find((m) => scoreMatch(name, m.item_name) > 0) ?? null
}

async function findInvoiceTemplate(name: string): Promise<InvoiceTemplateRow | null> {
    const json = await apiJson('/api/invoice-templates')
    const rows = Array.isArray(json.data) ? (json.data as InvoiceTemplateRow[]) : []
    return rows.find((t) => scoreMatch(name, t.name) > 0) ?? null
}

async function setDefaultInvoiceTemplate(templateId: string) {
    const json = await apiJson('/api/invoice-templates')
    const rows = Array.isArray(json.data) ? (json.data as InvoiceTemplateRow[]) : []
    for (const row of rows) {
        await apiJson('/api/invoice-templates', {
            method: 'PATCH',
            body: JSON.stringify({ id: row.id, is_default: row.id === templateId }),
        })
    }
}

async function findDocument(params: {
    title?: string
    clientName?: string
    documentType?: 'contract' | 'legal_notice'
}): Promise<AiDocumentRow | null | 'ambiguous'> {
    const url = params.documentType ? `/api/ai-documents?type=${params.documentType}` : '/api/ai-documents'
    const json = await apiJson(url)
    let rows = (Array.isArray(json.data) ? json.data : []) as AiDocumentRow[]
    if (params.documentType) rows = rows.filter((d) => d.document_type === params.documentType)
    if (params.title) rows = rows.filter((d) => scoreMatch(params.title!, d.title) > 0)
    if (params.clientName) {
        const q = params.clientName.toLowerCase()
        rows = rows.filter((d) => d.clients?.name?.toLowerCase().includes(q) || d.recipient_email?.toLowerCase().includes(q))
    }
    if (rows.length > 1 && !params.title) return 'ambiguous'
    return rows[0] ?? null
}

async function resolveProjectForDocument(params: {
    projectName?: string
    clientId?: string | null
}): Promise<
    | { ok: true; project: ProjectRow }
    | { ok: false; reason: 'missing_project' | 'project_not_found' | 'project_has_no_client' | 'client_mismatch'; project?: ProjectRow }
> {
    if (!params.projectName) return { ok: false, reason: 'missing_project' }
    const projects = await apiProjects()
    const project = pickBestProject(params.projectName, projects)
    if (!project) return { ok: false, reason: 'project_not_found' }
    if (!project.client_id) return { ok: false, reason: 'project_has_no_client', project }
    if (params.clientId && project.client_id !== params.clientId) {
        return { ok: false, reason: 'client_mismatch', project }
    }
    return { ok: true, project }
}

export async function runPmCommand(parsed: ParsedPmCommand): Promise<RunnerResult> {
    const store = usePmChatStore.getState()

    if (parsed.kind === 'confirm_no') {
        store.setPendingConfirm(null)
        return { reply: 'Cancelled.' }
    }

    if (parsed.kind === 'confirm_yes') {
        const p = store.pendingConfirm
        if (!p) return { reply: 'Nothing to confirm.' }
        store.setPendingConfirm(null)
        if (p.kind === 'delete_project') {
            const res = await fetch('/api/projects', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.projectId }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) return { reply: `Could not delete: ${json.error || res.statusText}` }
            if (store.taskBoardProjectId === p.projectId) store.clearTaskFilters()
            if (store.lastMentionedProjectId === p.projectId) store.setLastMentionedProject(null)
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: `Deleted project **${p.title}**.` }
        }
        if (p.kind === 'delete_task') {
            const res = await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.taskId }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) return { reply: `Could not delete task: ${json.error || res.statusText}` }
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: `Deleted task **${p.title}**.` }
        }
        if (p.kind === 'batch_mark_tasks') {
            const { items, nextStatus } = p
            for (const it of items) {
                const res = await fetch('/api/tasks', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: it.id, status: nextStatus }),
                })
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}))
                    return { reply: `Stopped: could not update a task — ${j.error || res.statusText}` }
                }
            }
            const snapshot = [...items]
            store.pushUndo(`Batch mark (${items.length})`, async () => {
                for (const it of snapshot) {
                    await fetch('/api/tasks', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: it.id, status: it.prevStatus }),
                    })
                }
            })
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: `Updated **${items.length}** task(s) to **${nextStatus}**.` }
        }
        if (p.kind === 'email_invoice') {
            const ui = useStore.getState()
            ui.clearFilters()
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            const result = await emailInvoiceViaAi({
                invoiceNumber: p.invoiceNumber,
                clientName: p.clientName,
                freelancerName: 'SoloOS',
                freelancerEmail: 'billing@soloos.app',
            })
            if (!result.ok) return { reply: `Could not email invoice: ${result.message}` }
            return { reply: result.message }
        }
        if (p.kind === 'send_reminder') {
            const res = await fetch('/api/appointments/remind', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ appointmentId: p.appointmentId }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) return { reply: `Could not send reminder: ${json.error || res.statusText}` }
            return { reply: `Sent reminder for **${p.title}**${p.clientName ? ` to **${p.clientName}**` : ''}.` }
        }
        if (p.kind === 'mark_invoice_status') {
            const { data: before } = await supabase
                .from('invoices')
                .select('status')
                .eq('id', p.invoiceId)
                .maybeSingle()
            const res = await supabase
                .from('invoices')
                .update({ status: p.status })
                .eq('id', p.invoiceId)
                .select('id')
                .single()
            if (res.error) return { reply: `Could not update invoice: ${res.error.message}` }
            if (before?.status) {
                store.pushUndo(`Invoice ${p.invoiceNumber} → ${p.status}`, async () => {
                    await supabase.from('invoices').update({ status: before.status }).eq('id', p.invoiceId)
                })
            }
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: `Marked invoice **${p.invoiceNumber}** as **${p.status}**.` }
        }
        if (p.kind === 'send_document') {
            const json = await apiJson('/api/ai-documents/send', {
                method: 'POST',
                body: JSON.stringify({ id: p.documentId }),
            })
            window.dispatchEvent(new Event('soloos:documents-refresh'))
            return {
                reply: `Sent **${p.title}** to **${json.data.recipient_email || p.recipientEmail}**.`,
            }
        }
        return { reply: 'Done.' }
    }

    if (parsed.kind === 'undo') {
        const u = await store.popUndo()
        if (!u) return { reply: 'Nothing to undo.' }
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: u.ok ? `Undid: ${u.label}` : 'Undo failed.' }
    }

    if (parsed.kind === 'help') {
        return {
            reply:
                '**Projects:** create project [name] · list projects · rename project [old] to [new] · delete project [name] · **put project [name] on hold** · **mark project [name] as in progress / review / done**\n' +
                '**Project edits:** edit project [name] · set [project] budget to 50000 · set [project] deadline to 2026-06-30 · show project profitability\n' +
                '**Current project:** after **show tasks in X** or creating a project: **make this project on hold** · **set this project to review**\n' +
                '**Tasks:** add task … · update task [name] due to 2026-06-30 · delete task … · mark … as done · **mark all tasks as …**\n' +
                '**Clients:** show clients · show client [name] · active clients · clients in [city]\n' +
                '**Invoices:** show invoices · show invoice [number] · create invoice for [client] [amount] · email invoice [number] · mark invoice [number] paid\n' +
                '**Templates/Documents:** create invoice template [name] · set template [name] message to ... · draft contract for [client] · send contract to [client]\n' +
                '**Reminders:** remind [client] about the next call\n' +
                '**View:** show tasks in [project] · show all tasks · show completed tasks · clear filters\n' +
                '**Other:** summary · current context · undo · yes/no after confirmations',
        }
    }

    if (parsed.kind === 'clear_filters') {
        store.clearTaskFilters()
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: 'Filters cleared. Showing all tasks.' }
    }

    if (parsed.kind === 'current_context') {
        const pid = store.taskBoardProjectId
        const title = store.taskBoardProjectTitle
        const st = store.taskStatusFilter
        if (!pid && !st) return { reply: 'No task filter — showing all projects / all tasks.' }
        const parts: string[] = []
        if (pid && title) parts.push(`Task view: **${title}**`)
        if (st) parts.push(`Status filter: **${st}**`)
        return { reply: parts.join(' · ') }
    }

    if (parsed.kind === 'summary') {
        const projects = await apiProjects()
        const tasks = await apiTasks()
        const done = tasks.filter((t) => t.status === 'done').length
        return {
            reply: `**${projects.length}** projects · **${tasks.length}** tasks (**${done}** done).`,
        }
    }

    if (parsed.kind === 'list_projects') {
        const projects = await apiProjects()
        if (projects.length === 0) return { reply: 'No projects yet. Say **create project [name]**.' }
        const lines = projects.map((p) => `• **${p.title}**`).join('\n')
        return { reply: `Projects:\n${lines}` }
    }

    if (parsed.kind === 'list_inventory') {
        const json = await apiJson('/api/inventory')
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ item_name: string; quantity: number; low_stock_threshold: number }>
        const filtered = parsed.lowStock ? rows.filter((i) => i.quantity <= i.low_stock_threshold) : rows
        return {
            reply: filtered.length
                ? `${parsed.lowStock ? 'Low stock' : 'Inventory'}:\n${filtered.slice(0, 8).map((i) => `• **${i.item_name}**: ${i.quantity}`).join('\n')}`
                : parsed.lowStock ? 'No low-stock items.' : 'No inventory yet.',
        }
    }

    if (parsed.kind === 'add_inventory') {
        const json = await apiJson('/api/inventory', {
            method: 'POST',
            body: JSON.stringify({
                item_name: parsed.itemName,
                quantity: parsed.quantity ?? 0,
                unit_cost: parsed.unitCost ?? null,
                category: parsed.category ?? null,
                low_stock_threshold: parsed.lowStockThreshold ?? 5,
            }),
        })
        window.dispatchEvent(new Event('soloos:inventory-refresh'))
        return { reply: `Added inventory item **${json.data.item_name}**.` }
    }

    if (parsed.kind === 'update_inventory_quantity') {
        const item = await findInventoryItem(parsed.itemName)
        if (!item) return { reply: `No inventory item matching “${parsed.itemName}”.` }
        await apiJson('/api/inventory', {
            method: 'PATCH',
            body: JSON.stringify({ id: item.id, quantity: parsed.quantity }),
        })
        window.dispatchEvent(new Event('soloos:inventory-refresh'))
        return { reply: `Updated **${item.item_name}** quantity to **${parsed.quantity}**.` }
    }

    if (parsed.kind === 'list_expenses') {
        const url = parsed.category ? `/api/expenses?category=${encodeURIComponent(parsed.category)}` : '/api/expenses'
        const json = await apiJson(url)
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ category: string; amount: number; description?: string | null }>
        const total = rows.reduce((sum, e) => sum + Number(e.amount || 0), 0)
        return {
            reply: rows.length
                ? `Expenses total **₹${total.toLocaleString('en-IN')}**:\n${rows.slice(0, 8).map((e) => `• **${e.category}** ₹${Number(e.amount).toLocaleString('en-IN')}${e.description ? ` — ${e.description}` : ''}`).join('\n')}`
                : 'No expenses found.',
        }
    }

    if (parsed.kind === 'add_expense') {
        const json = await apiJson('/api/expenses', {
            method: 'POST',
            body: JSON.stringify({
                category: parsed.category,
                amount: parsed.amount,
                gst_amount: parsed.gstAmount ?? null,
                date: parsed.date ?? new Date().toISOString().slice(0, 10),
                description: parsed.description ?? null,
            }),
        })
        window.dispatchEvent(new Event('soloos:expenses-refresh'))
        return { reply: `Added **₹${Number(json.data.amount).toLocaleString('en-IN')}** expense for **${json.data.category}**.` }
    }

    if (parsed.kind === 'show_profit_loss') {
        return { reply: 'Opening profit and loss.' }
    }

    if (parsed.kind === 'list_team') {
        const json = await apiJson('/api/team-members')
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ name: string; role?: string | null; status?: string | null }>
        return {
            reply: rows.length
                ? `Team:\n${rows.slice(0, 8).map((m) => `• **${m.name}**${m.role ? ` — ${m.role}` : ''}${m.status ? ` (${m.status})` : ''}`).join('\n')}`
                : 'No team members yet.',
        }
    }

    if (parsed.kind === 'add_team_member') {
        const json = await apiJson('/api/team-members', {
            method: 'POST',
            body: JSON.stringify({
                name: parsed.name,
                role: parsed.role ?? null,
                email: parsed.email ?? null,
                payout_rate: parsed.payoutRate ?? null,
                payout_type: parsed.payoutRate ? 'fixed' : undefined,
                status: 'active',
            }),
        })
        window.dispatchEvent(new Event('soloos:team-refresh'))
        return { reply: `Added team member **${json.data.name}**.` }
    }

    if (parsed.kind === 'list_payouts') {
        const url = parsed.status ? `/api/payouts?status=${encodeURIComponent(parsed.status)}` : '/api/payouts'
        const json = await apiJson(url)
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ amount: number; status?: string | null; team_members?: { name?: string } | null }>
        const total = rows.reduce((sum, p) => sum + Number(p.amount || 0), 0)
        return {
            reply: rows.length
                ? `Payouts total **₹${total.toLocaleString('en-IN')}**:\n${rows.slice(0, 8).map((p) => `• **${p.team_members?.name ?? 'Team'}** ₹${Number(p.amount).toLocaleString('en-IN')} (${p.status ?? 'owed'})`).join('\n')}`
                : 'No payouts found.',
        }
    }

    if (parsed.kind === 'add_payout') {
        const member = await findTeamMember(parsed.memberName)
        if (!member) return { reply: `No team member matching “${parsed.memberName}”.` }
        await apiJson('/api/payouts', {
            method: 'POST',
            body: JSON.stringify({
                team_member_id: member.id,
                amount: parsed.amount,
                status: 'owed',
                notes: parsed.notes ?? null,
            }),
        })
        window.dispatchEvent(new Event('soloos:payouts-refresh'))
        return { reply: `Added payout **₹${parsed.amount.toLocaleString('en-IN')}** for **${member.name}**.` }
    }

    if (parsed.kind === 'list_assignments') {
        const json = await apiJson('/api/work-assignments')
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ title?: string | null; team_members?: { name?: string } | null; tasks?: { title?: string } | null }>
        return {
            reply: rows.length
                ? `Assignments:\n${rows.slice(0, 8).map((a) => `• **${a.title || a.tasks?.title || 'Work'}** → ${a.team_members?.name ?? 'Unassigned'}`).join('\n')}`
                : 'No assignments yet.',
        }
    }

    if (parsed.kind === 'assign_work') {
        const member = await findTeamMember(parsed.memberName)
        if (!member) return { reply: `No team member matching “${parsed.memberName}”.` }
        const tasks = await apiTasks(null)
        const resolved = resolveTaskMatch(parsed.taskTitle, tasks)
        if (!resolved.ok) return { reply: `No clear task matching “${parsed.taskTitle}”.` }
        await apiJson('/api/work-assignments', {
            method: 'POST',
            body: JSON.stringify({
                team_member_id: member.id,
                task_id: resolved.task.id,
                project_id: resolved.task.project_id,
                title: resolved.task.title,
                status: 'assigned',
            }),
        })
        window.dispatchEvent(new Event('soloos:assignments-refresh'))
        return { reply: `Assigned **${resolved.task.title}** to **${member.name}**.` }
    }

    if (parsed.kind === 'show_project_profit') {
        const projects = await apiProjects()
        const candidates = parsed.projectName
            ? projects.filter((p) => scoreMatch(parsed.projectName!, p.title) > 0)
            : projects
        if (parsed.projectName && candidates.length === 0) {
            return { reply: `No project matching “${parsed.projectName}”.` }
        }
        const lines = candidates
            .filter((p) => p.budget)
            .slice(0, 6)
            .map((p) => {
                const totalHours = (p.tasks ?? []).reduce((sum, t) => sum + (t.actual_hours || 0), 0)
                const rate = totalHours > 0 && p.budget ? Math.round(p.budget / totalHours) : 0
                return `• **${p.title}**: ₹${Number(p.budget).toLocaleString('en-IN')} budget · ${totalHours}h logged${rate ? ` · ₹${rate}/hr` : ''}`
            })
        return {
            reply: lines.length
                ? `Project profitability:\n${lines.join('\n')}`
                : 'No project budgets found yet. Add a budget to see hourly profitability.',
        }
    }

    if (parsed.kind === 'behind_schedule_projects') {
        const projects = await apiProjects()
        const today = new Date()
        today.setHours(0, 0, 0, 0)

        const late = projects.filter((p) => {
            if (!p.deadline) return false
            if (p.status === 'done') return false
            const due = new Date(p.deadline)
            due.setHours(0, 0, 0, 0)
            return due < today
        })

        if (late.length === 0) {
            return { reply: 'No projects are behind schedule right now.' }
        }

        return {
            reply:
                `Behind schedule:\n` +
                late
                    .map((p) => `• **${p.title}**${p.deadline ? ` — due ${p.deadline}` : ''}`)
                    .join('\n'),
            chips: late.slice(0, 6).map((p) => ({
                label: `Open ${p.title}`,
                payload: `edit project ${p.title}`,
            })),
        }
    }

    if (parsed.kind === 'show_tasks') {
        if (parsed.all) {
            store.clearTaskFilters()
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: 'Showing **all** tasks (no project filter).' }
        }
        if (!parsed.projectName) return { reply: 'Say which project: **show tasks in [name]**.' }
        const projects = await apiProjects()
        const matches = projects.filter((p) => scoreMatch(parsed.projectName!, p.title) > 0)
        if (matches.length === 0) {
            const ranked = fuzzyRankProjects(parsed.projectName!, projects)
            const top = ranked.slice(0, 6)
            const best = top[0]
            if (top.length > 0 && best && best.score >= 42) {
                return {
                    reply:
                        best.score >= 58
                            ? `Closest to “${parsed.projectName}” looks like **${best.p.title}**. Tap to confirm or pick another:`
                            : `No exact match for “${parsed.projectName}”. Did you mean one of these?`,
                    chips: top.map((x) => ({
                        label: x.p.title,
                        payload: `show tasks in ${x.p.title}`,
                    })),
                }
            }
            if (projects.length > 0 && projects.length <= 14) {
                return {
                    reply: `No project named like “${parsed.projectName}”. Pick one of your **${projects.length}** projects:`,
                    chips: projects.map((p) => ({
                        label: p.title,
                        payload: `show tasks in ${p.title}`,
                    })),
                }
            }
            return { reply: `No project matching “${parsed.projectName}”. Try **list projects**.` }
        }
        if (matches.length > 1) {
            return {
                reply: `Multiple matches for “${parsed.projectName}”. Pick one:`,
                chips: matches.slice(0, 4).map((p) => ({
                    label: p.title,
                    payload: `show tasks in ${p.title}`,
                })),
            }
        }
        const p = matches[0]!
        store.setTaskView(p.id, p.title)
        store.setTaskStatusFilter(null)
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Filtering tasks to **${p.title}**.` }
    }

    if (parsed.kind === 'filter_tasks_status') {
        const raw = parsed.status
        if (raw.startsWith('due:')) {
            store.setTaskStatusFilter(raw)
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: `Filter: **${raw.replace('due:', 'due ')}** (applied in task list).` }
        }
        if (raw === 'overdue') {
            store.setTaskStatusFilter('overdue')
            window.dispatchEvent(new Event('soloos:pm-refresh'))
            return { reply: 'Showing **overdue** tasks (by due date).' }
        }
        store.setTaskStatusFilter(raw)
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Filter: tasks with status **${raw}**.` }
    }

    if (parsed.kind === 'create_project') {
        if (!parsed.name) return { reply: 'Give a project name, e.g. **create project Website**.' }
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: parsed.name }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not create: ${json.error || res.statusText}` }
        const created = json.data as { id: string; title: string }
        store.setLastMentionedProject(created.id)
        store.pushUndo(`Created project “${created.title}”`, async () => {
            await fetch('/api/projects', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: created.id }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return {
            reply: `Created project **${created.title}**.`,
            chips: [{ label: 'View tasks in this project', payload: `show tasks in ${created.title}` }],
        }
    }

    if (parsed.kind === 'rename_project') {
        const projects = await apiProjects()
        const proj = pickBestProject(parsed.from, projects)
        if (!proj) return { reply: `Could not find project “${parsed.from}”.` }
        const res = await fetch('/api/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: proj.id, title: parsed.to }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Rename failed: ${json.error || res.statusText}` }
        if (store.taskBoardProjectId === proj.id) store.setTaskView(proj.id, parsed.to)
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Renamed **${proj.title}** → **${parsed.to}**.` }
    }

    if (parsed.kind === 'open_project_editor') {
        const projects = await apiProjects()
        const proj = pickBestProject(parsed.name, projects)
        if (!proj) return { reply: `Could not find project “${parsed.name}”.` }
        store.setLastMentionedProject(proj.id)
        window.dispatchEvent(new CustomEvent('soloos:edit-project', { detail: { id: proj.id, title: proj.title } }))
        return { reply: `Opening **${proj.title}** for editing.` }
    }

    if (parsed.kind === 'update_project') {
        const projects = await apiProjects()
        const proj = pickBestProject(parsed.name, projects)
        if (!proj) return { reply: `Could not find project “${parsed.name}”.` }

        const updates: Record<string, unknown> = { id: proj.id }
        if (parsed.updates.title !== undefined) updates.title = parsed.updates.title
        if (parsed.updates.description !== undefined) updates.description = parsed.updates.description
        if (parsed.updates.budget !== undefined) updates.budget = parsed.updates.budget
        if (parsed.updates.deadline !== undefined) updates.deadline = parsed.updates.deadline
        if (parsed.updates.status !== undefined) updates.status = mapProjectStatus(parsed.updates.status)
        if (parsed.updates.clientName !== undefined) {
            updates.client_id = parsed.updates.clientName ? await resolveClientId(parsed.updates.clientName) : null
            if (parsed.updates.clientName && !updates.client_id) {
                return { reply: `Could not find client “${parsed.updates.clientName}”.` }
            }
        }
        if (Object.keys(updates).length === 1) return { reply: 'What should I update on that project?' }

        const prev = { ...proj }
        const res = await fetch('/api/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not update project: ${json.error || res.statusText}` }
        store.setLastMentionedProject(proj.id)
        store.pushUndo(`Updated project “${proj.title}”`, async () => {
            await fetch('/api/projects', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: prev.id,
                    title: prev.title,
                    description: prev.description ?? null,
                    budget: prev.budget ?? null,
                    deadline: prev.deadline ?? null,
                    client_id: prev.client_id ?? null,
                    status: prev.status ?? 'not_started',
                }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Updated **${proj.title}**.` }
    }

    if (parsed.kind === 'set_project_status') {
        const next =
            ALLOWED_PROJECT_STATUS.has(parsed.status) ? parsed.status : mapProjectStatus(parsed.status)
        if (!ALLOWED_PROJECT_STATUS.has(next)) {
            return {
                reply: 'Use a board column: **not started**, **in progress**, **review**, **done**, **on hold**.',
            }
        }
        const projects = await apiProjects()
        const picked = pickProjectForStatusCommand(parsed, projects, store)
        if (picked.ok === false) {
            if (picked.reason === 'no_current') {
                return {
                    reply: 'Name the project (**put project Acme on hold**) or focus one with **show tasks in [name]** / pick a board card — then **make this project on hold** works.',
                }
            }
            if (picked.reason === 'ambiguous') {
                return {
                    reply: 'Which project?',
                    chips: picked.matches.map((p) => ({
                        label: p.title,
                        payload: `__pm:projstatus:${p.id}:${next}`,
                    })),
                }
            }
            if (picked.reason === 'fuzzy') {
                return {
                    reply: 'Did you mean one of these?',
                    chips: picked.candidates.map((p) => ({
                        label: p.title,
                        payload: `__pm:projstatus:${p.id}:${next}`,
                    })),
                }
            }
            return { reply: 'No project found. Try **list projects**.' }
        }
        const proj = picked.project
        const prevRaw = proj.status && ALLOWED_PROJECT_STATUS.has(proj.status) ? proj.status : proj.status || 'not_started'
        const prev = ALLOWED_PROJECT_STATUS.has(prevRaw) ? prevRaw : 'not_started'
        if (prev === next) {
            const lbl = PROJECT_STATUS_LABEL[next] ?? next
            return { reply: `**${proj.title}** is already **${lbl}**.` }
        }
        const res = await fetch('/api/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: proj.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not update: ${json.error || res.statusText}` }
        store.setLastMentionedProject(proj.id)
        const labelDone = PROJECT_STATUS_LABEL[next] ?? next
        store.pushUndo(`Project “${proj.title}” → ${labelDone}`, async () => {
            await fetch('/api/projects', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: proj.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `**${proj.title}** is now **${labelDone}** on the board.` }
    }

    if (parsed.kind === 'delete_project') {
        const projects = await apiProjects()
        const matches = projects.filter((p) => scoreMatch(parsed.name, p.title) > 0)
        if (matches.length === 0) return { reply: `No project matching “${parsed.name}”.` }
        if (matches.length > 1) {
            return {
                reply: 'Which project?',
                chips: matches.slice(0, 4).map((p) => ({
                    label: p.title,
                    payload: `delete project ${p.title}`,
                })),
            }
        }
        const proj = matches[0]!
        store.setPendingConfirm({ kind: 'delete_project', projectId: proj.id, title: proj.title })
        return {
            reply: `Delete project **${proj.title}** and its tasks from the database? This cannot be undone here.`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'add_task') {
        if (!parsed.title) return { reply: 'What should the task be called?' }
        let projectId: string | null = store.taskBoardProjectId
        let projectTitle = store.taskBoardProjectTitle
        if (parsed.projectName) {
            const projects = await apiProjects()
            const p = pickBestProject(parsed.projectName, projects)
            if (!p) return { reply: `No project “${parsed.projectName}”. **list projects**` }
            projectId = p.id
            projectTitle = p.title
        }
        if (!projectId) {
            const projects = await apiProjects()
            return {
                reply: 'Which project should this task belong to?',
                chips: projects.slice(0, 6).map((p) => ({
                    label: p.title,
                    payload: `add task ${parsed.title} to ${p.title}`,
                })),
            }
        }
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: parsed.title,
                project_id: projectId,
                status: 'todo',
            }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not add task: ${json.error || res.statusText}` }
        const task = json.data as TaskRow
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Added task “${task.title}”`, async () => {
            await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Added **${task.title}** to **${projectTitle || 'project'}**.` }
    }

    if (parsed.kind === 'mark_all_tasks') {
        const next = mapTaskStatus(parsed.status)
        let tasks = await apiTasks(null)
        if (parsed.projectName) {
            const projects = await apiProjects()
            const p = pickBestProject(parsed.projectName, projects)
            if (!p) return { reply: `No project matching “${parsed.projectName}”.` }
            tasks = tasks.filter((t) => t.project_id === p.id)
        } else if (store.taskBoardProjectId) {
            tasks = tasks.filter((t) => t.project_id === store.taskBoardProjectId)
        }
        const toUpdate = tasks.filter((t) => t.status !== next)
        if (toUpdate.length === 0) {
            return { reply: 'No tasks to update (already at that status, or list is empty).' }
        }
        const scope =
            parsed.projectName ||
            (store.taskBoardProjectTitle ? `**${store.taskBoardProjectTitle}**` : '**all projects**')
        store.setPendingConfirm({
            kind: 'batch_mark_tasks',
            items: toUpdate.map((t) => ({ id: t.id, prevStatus: t.status })),
            nextStatus: next,
            summary: scope,
        })
        return {
            reply: `Mark **${toUpdate.length}** task(s) in ${scope} as **${next}**?`,
            chips: [
                { label: 'Yes, update all', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'mark_task_by_id') {
        const task = await findTaskById(parsed.taskId)
        if (!task) return { reply: 'Task not found (maybe it was deleted).' }
        const next = mapTaskStatus(parsed.status)
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Update failed: ${json.error || res.statusText}` }
        const prev = task.status
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Marked “${task.title}” as ${next}`, async () => {
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Updated **${task.title}** → **${next}**.` }
    }

    if (parsed.kind === 'delete_task_by_id') {
        const task = await findTaskById(parsed.taskId)
        if (!task) return { reply: 'Task not found.' }
        store.setPendingConfirm({ kind: 'delete_task', taskId: task.id, title: task.title })
        return {
            reply: `Delete task **${task.title}**?`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'delete_task') {
        const pid = store.taskBoardProjectId
        let tasks = await apiTasks(pid)
        let resolved = resolveTaskMatch(parsed.title, tasks)
        if (resolved.ok === false && resolved.reason === 'none' && pid) {
            tasks = await apiTasks(null)
            resolved = resolveTaskMatch(parsed.title, tasks)
        }
        if (resolved.ok === false && resolved.reason === 'none') {
            return {
                reply: `No task matching “${parsed.title}”. Try **show tasks in [project]** or use a more specific name.`,
            }
        }
        if (resolved.ok === false && resolved.reason === 'ambiguous') {
            return {
                reply: `Multiple tasks match “${parsed.title}”. Pick one to delete:`,
                chips: resolved.candidates.map((c) => ({
                    label: `${c.title} (${c.projects?.title ?? 'project'})`,
                    payload: `__pm:delete:${c.id}`,
                })),
            }
        }
        const task = resolved.task
        store.setPendingConfirm({ kind: 'delete_task', taskId: task.id, title: task.title })
        return {
            reply: `Delete task **${task.title}**?`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'update_task') {
        const pid = store.taskBoardProjectId
        let tasks = await apiTasks(pid)
        let resolved = resolveTaskMatch(parsed.title, tasks)
        if (resolved.ok === false && resolved.reason === 'none' && pid) {
            tasks = await apiTasks(null)
            resolved = resolveTaskMatch(parsed.title, tasks)
        }
        if (resolved.ok === false && resolved.reason === 'none') {
            return { reply: `No task matching “${parsed.title}”.` }
        }
        if (resolved.ok === false && resolved.reason === 'ambiguous') {
            return {
                reply: `Multiple tasks match “${parsed.title}”. Pick one first:`,
                chips: resolved.candidates.map((c) => ({
                    label: `${c.title} (${c.projects?.title ?? 'project'})`,
                    payload: `show tasks in ${c.projects?.title ?? ''}`.trim(),
                })),
            }
        }
        const task = resolved.task
        const updates: Record<string, unknown> = { id: task.id }
        if (parsed.updates.title !== undefined) updates.title = parsed.updates.title
        if (parsed.updates.estimatedHours !== undefined) updates.estimated_hours = parsed.updates.estimatedHours
        if (parsed.updates.dueDate !== undefined) updates.due_date = parsed.updates.dueDate
        if (parsed.updates.status !== undefined) updates.status = mapTaskStatus(parsed.updates.status)
        if (Object.keys(updates).length === 1) return { reply: 'What should I update on that task?' }

        const prev = { ...task }
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not update task: ${json.error || res.statusText}` }
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Updated task “${task.title}”`, async () => {
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: prev.id,
                    title: prev.title,
                    status: prev.status,
                    estimated_hours: prev.estimated_hours ?? null,
                    due_date: prev.due_date ?? null,
                }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Updated task **${task.title}**.` }
    }

    if (parsed.kind === 'list_clients') {
        const ui = useStore.getState()
        ui.clearFilters()
        if (parsed.search) ui.setFilter('search', parsed.search)
        if (parsed.status) ui.setFilter('status', parsed.status)
        if (parsed.city) ui.setFilter('city', parsed.city)
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        const parts: string[] = ['Showing clients']
        if (parsed.status) parts.push(`status **${parsed.status}**`)
        if (parsed.city) parts.push(`in **${parsed.city}**`)
        if (parsed.search) parts.push(`matching **${parsed.search}**`)
        return { reply: `${parts.join(' ')}.` }
    }

    if (parsed.kind === 'list_invoices') {
        return { reply: 'Showing invoices.' }
    }

    if (parsed.kind === 'list_invoice_templates') {
        const json = await apiJson('/api/invoice-templates')
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ name: string; is_default?: boolean }>
        return {
            reply: rows.length
                ? `Invoice templates:\n${rows.map((t) => `• **${t.name}**${t.is_default ? ' (default)' : ''}`).join('\n')}`
                : 'No invoice templates yet.',
        }
    }

    if (parsed.kind === 'create_invoice_template') {
        const json = await apiJson('/api/invoice-templates', {
            method: 'POST',
            body: JSON.stringify({
                name: parsed.name,
                accent_color: parsed.accentColor ?? '#7c3aed',
                payment_terms: parsed.terms ?? 'Due on receipt',
                default_email_subject: parsed.subject ?? 'Invoice from SoloOS',
                default_email_message: parsed.message ?? 'Hi, please find the invoice attached.',
                is_default: false,
            }),
        })
        window.dispatchEvent(new Event('soloos:templates-refresh'))
        return { reply: `Created invoice template **${json.data.name}**.` }
    }

    if (parsed.kind === 'update_invoice_template') {
        const template = await findInvoiceTemplate(parsed.name)
        if (!template) return { reply: `No invoice template matching “${parsed.name}”.` }
        const updates: Record<string, unknown> = { id: template.id }
        if (parsed.updates.subject !== undefined) updates.default_email_subject = parsed.updates.subject
        if (parsed.updates.message !== undefined) updates.default_email_message = parsed.updates.message
        if (parsed.updates.terms !== undefined) updates.payment_terms = parsed.updates.terms
        if (parsed.updates.footer !== undefined) updates.footer_note = parsed.updates.footer
        if (parsed.updates.accentColor !== undefined) updates.accent_color = parsed.updates.accentColor
        if (parsed.updates.isDefault !== undefined) updates.is_default = parsed.updates.isDefault
        if (Object.keys(updates).length === 1) return { reply: 'What should I change on that template?' }

        if (parsed.updates.isDefault) {
            await setDefaultInvoiceTemplate(template.id)
        } else {
            await apiJson('/api/invoice-templates', {
                method: 'PATCH',
                body: JSON.stringify(updates),
            })
        }
        window.dispatchEvent(new Event('soloos:templates-refresh'))
        return { reply: `Updated invoice template **${template.name}**.` }
    }

    if (parsed.kind === 'list_documents') {
        const url = parsed.documentType ? `/api/ai-documents?type=${parsed.documentType}` : '/api/ai-documents'
        const json = await apiJson(url)
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ title: string; document_type: string; status: string }>
        return {
            reply: rows.length
                ? `Documents:\n${rows.slice(0, 8).map((d) => `• **${d.title}** — ${d.document_type.replace('_', ' ')} (${d.status})`).join('\n')}`
                : 'No saved documents yet.',
        }
    }

    if (parsed.kind === 'draft_contract') {
        const client = parsed.clientName ? await resolveClient(parsed.clientName) : null
        if (parsed.clientName && !client) return { reply: `Could not find client “${parsed.clientName}”.` }
        const projectResolution = await resolveProjectForDocument({
            projectName: parsed.projectName,
            clientId: client?.id ?? null,
        })
        if (!projectResolution.ok) {
            if (projectResolution.reason === 'missing_project') {
                return { reply: 'Which assigned project should this contract use? Say **draft contract for [client] project [project name]**.' }
            }
            if (projectResolution.reason === 'project_not_found') {
                return { reply: `Could not find project “${parsed.projectName}”.` }
            }
            if (projectResolution.reason === 'project_has_no_client') {
                return {
                    reply: `Project **${projectResolution.project?.title}** is not assigned to a client. Assign a client first, then draft the contract.`,
                    chips: [{ label: 'Edit project', payload: `edit project ${projectResolution.project?.title ?? ''}`.trim() }],
                }
            }
            if (projectResolution.reason === 'client_mismatch') {
                return { reply: `Project **${projectResolution.project?.title}** is assigned to **${projectResolution.project?.clients?.name ?? 'another client'}**, not **${client?.name}**. I blocked this to avoid sending the wrong contract.` }
            }
        }
        if (!projectResolution.ok) return { reply: 'Could not prepare the contract from that project.' }
        const project = projectResolution.project
        const contractClient = client ?? (project.clients ? { id: project.clients.id, name: project.clients.name, email: null } : null)
        const title = parsed.title || documentTitle('contract', contractClient?.name, project.title)
        const content =
            `SERVICE AGREEMENT\n\n` +
            `Client: ${contractClient?.name || '[Client name]'}\n` +
            `Project: ${project.title}\n` +
            `Budget: ${project.budget ? `₹${Number(project.budget).toLocaleString('en-IN')}` : '[Add amount]'}\n` +
            `Deadline: ${project.deadline || '[Add deadline]'}\n\n` +
            `Scope of Work:\n${project.description || '[Describe deliverables, milestones, revision limits, and acceptance criteria.]'}\n\n` +
            `Commercial Terms:\n${parsed.terms || 'Payment terms, taxes, late fees, and milestone schedule to be reviewed and finalized by both parties.'}\n\n` +
            `Timeline:\nThe work will follow the project deadline and any milestone dates agreed in writing.\n\n` +
            `This is a draft generated by SoloOS and should be reviewed before sending.`
        await apiJson('/api/ai-documents', {
            method: 'POST',
            body: JSON.stringify({
                document_type: 'contract',
                title,
                client_id: contractClient?.id ?? null,
                project_id: project.id,
                recipient_email: contractClient?.email ?? null,
                status: 'draft',
                question_answers: {
                    clientName: contractClient?.name,
                    projectName: project.title,
                    terms: parsed.terms,
                },
                content,
            }),
        })
        window.dispatchEvent(new Event('soloos:documents-refresh'))
        return { reply: `Saved contract draft **${title}**. Review it before sending.` }
    }

    if (parsed.kind === 'draft_legal_notice') {
        const invoice = parsed.invoiceNumber ? await findInvoice({ invoiceNumber: parsed.invoiceNumber }) : null
        if (parsed.invoiceNumber && !invoice) return { reply: `Could not find invoice **${parsed.invoiceNumber}**.` }
        if (!invoice) return { reply: 'Which unpaid invoice should this legal notice refer to? Say **draft legal notice for [client] invoice [invoice number]**.' }
        if (parsed.clientName && invoice.clients?.name && scoreMatch(parsed.clientName, invoice.clients.name) === 0) {
            return { reply: `Invoice **${invoice.invoice_number}** belongs to **${invoice.clients.name}**, not **${parsed.clientName}**. I blocked this to avoid sending the wrong legal notice.` }
        }
        const title = parsed.title || documentTitle('legal_notice', invoice.clients?.name ?? parsed.clientName)
        const content =
            `LEGAL NOTICE FOR NON-PAYMENT\n\n` +
            `To: ${invoice.clients?.name || parsed.clientName || '[Client name]'}\n` +
            `Invoice: ${invoice.invoice_number}\n\n` +
            `This notice records that payment remains outstanding despite prior reminders. ` +
            `Please clear the dues within the stated period to avoid further action.\n\n` +
            `Outstanding Amount: ${invoice.total ? `₹${Number(invoice.total).toLocaleString('en-IN')}` : '[Amount]'}\nDue Date: [Due date]\n\n` +
            `This is a draft generated by SoloOS. Review with a qualified professional before sending.`
        await apiJson('/api/ai-documents', {
            method: 'POST',
            body: JSON.stringify({
                document_type: 'legal_notice',
                title,
                client_id: invoice.clients?.id ?? null,
                invoice_id: invoice?.id ?? null,
                recipient_email: invoice.clients?.email ?? null,
                status: 'draft',
                question_answers: {
                    clientName: invoice.clients?.name ?? parsed.clientName,
                    invoiceNumber: invoice.invoice_number,
                },
                content,
            }),
        })
        window.dispatchEvent(new Event('soloos:documents-refresh'))
        return { reply: `Saved legal notice draft **${title}**. I will not send it without confirmation.` }
    }

    if (parsed.kind === 'send_document') {
        const doc = await findDocument({
            title: parsed.title,
            clientName: parsed.clientName,
            documentType: parsed.documentType,
        })
        if (doc === 'ambiguous') {
            return {
                reply: 'Which saved document should I send?',
                chips: [{ label: 'Show documents', payload: 'show documents' }],
            }
        }
        if (!doc) {
            const label = parsed.documentType === 'legal_notice' ? 'legal notice' : parsed.documentType === 'contract' ? 'contract' : 'document'
            return { reply: `No saved ${label} found. Draft it first, then ask me to send it.` }
        }
        const recipientEmail = doc.recipient_email || doc.clients?.email || ''
        if (!recipientEmail) {
            return { reply: `**${doc.title}** has no recipient email. Add the client's email before sending.` }
        }
        store.setPendingConfirm({
            kind: 'send_document',
            documentId: doc.id,
            title: doc.title,
            recipientEmail,
            documentType: doc.document_type,
        })
        const serious = doc.document_type === 'legal_notice' ? ' Legal notices can have legal consequences.' : ''
        return {
            reply: `Send **${doc.title}** to **${recipientEmail}**?${serious}`,
            chips: [
                { label: 'Yes, send', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'list_payment_links') {
        const json = await apiJson('/api/payment-links')
        const rows = (Array.isArray(json.data) ? json.data : []) as Array<{ amount?: number | null; status?: string | null; url?: string | null; invoices?: { invoice_number?: string } | null }>
        return {
            reply: rows.length
                ? `Payment links:\n${rows.slice(0, 8).map((l) => `• **${l.invoices?.invoice_number ?? 'Payment'}** ${l.amount ? `₹${Number(l.amount).toLocaleString('en-IN')}` : ''} (${l.status ?? 'created'})`).join('\n')}`
                : 'No payment links yet.',
        }
    }

    if (parsed.kind === 'create_payment_link') {
        const invoice = await findInvoice({ invoiceNumber: parsed.invoiceNumber, clientName: parsed.clientName })
        if (!invoice) return { reply: 'Which invoice should I create a payment link for?' }
        await apiJson('/api/payment-links', {
            method: 'POST',
            body: JSON.stringify({
                invoice_id: invoice.id,
                provider: 'razorpay',
                amount: invoice.total ?? null,
                status: 'pending_provider_setup',
                url: null,
            }),
        })
        window.dispatchEvent(new Event('soloos:payment-links-refresh'))
        return { reply: `Saved payment link request for **${invoice.invoice_number}**. Razorpay keys/webhook still need to be connected for live collection.` }
    }

    if (parsed.kind === 'show_invoice') {
        if (!parsed.invoiceNumber && !parsed.clientName) {
            return { reply: 'Which invoice should I open?', chips: [{ label: 'Show invoices', payload: 'show invoices' }] }
        }
        const invoice = await findInvoice({
            invoiceNumber: parsed.invoiceNumber,
            clientName: parsed.clientName,
        })
        if (!invoice) return { reply: 'Invoice not found.' }
        const ui = useStore.getState()
        ui.clearFilters()
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return {
            reply: `Invoice **${invoice.invoice_number}** · ${invoice.clients?.name ?? 'Unknown client'} · **${invoice.status}**${invoice.total ? ` · ₹${invoice.total.toLocaleString('en-IN')}` : ''}.`,
            chips: [
                { label: 'Email this invoice', payload: `email invoice ${invoice.invoice_number}` },
                { label: 'Mark paid', payload: `mark invoice ${invoice.invoice_number} as paid` },
            ],
        }
    }

    if (parsed.kind === 'mark_invoice_status') {
        const invoice = await findInvoice({
            invoiceNumber: parsed.invoiceNumber,
            clientName: parsed.clientName,
        })
        if (!invoice) return { reply: 'Invoice not found.' }
        store.setPendingConfirm({
            kind: 'mark_invoice_status',
            invoiceId: invoice.id,
            invoiceNumber: invoice.invoice_number,
            status: parsed.status,
        })
        return {
            reply: `Mark invoice **${invoice.invoice_number}** as **${parsed.status}**?`,
            chips: [
                { label: 'Yes, update', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'create_invoice') {
        if (typeof parsed.amount !== 'number' || parsed.amount <= 0) {
            return {
                reply: `What amount should I put on the invoice for **${parsed.clientName}**?`,
                chips: [
                    { label: '5,000', payload: `create invoice for ${parsed.clientName} 5000` },
                    { label: '10,000', payload: `create invoice for ${parsed.clientName} 10000` },
                ],
            }
        }
        const result = await createInvoiceViaAi({
            clientName: parsed.clientName,
            amount: parsed.amount,
            description: parsed.description,
        })
        if (!result.ok) return { reply: `Could not create invoice: ${result.message}` }
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return {
            reply: result.message,
            chips: result.invoiceNumber
                ? [{ label: `View ${result.invoiceNumber}`, payload: 'show invoices' }]
                : undefined,
        }
    }

    if (parsed.kind === 'email_invoice') {
        if (!parsed.invoiceNumber && !parsed.clientName) {
            return {
                reply: 'Which invoice should I send?',
                chips: [{ label: 'Show invoices', payload: 'show invoices' }],
            }
        }
        store.setPendingConfirm({
            kind: 'email_invoice',
            invoiceNumber: parsed.invoiceNumber,
            clientName: parsed.clientName,
        })
        const target = parsed.invoiceNumber
            ? `invoice **${parsed.invoiceNumber}**`
            : parsed.clientName
              ? `the invoice for **${parsed.clientName}**`
              : 'the selected invoice'
        return {
            reply: `Send ${target} by email?`,
            chips: [
                { label: 'Yes, send', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'send_reminder') {
        const appt = await findNextAppointment(parsed.clientName)
        if (!appt) {
            return {
                reply: parsed.clientName
                    ? `No upcoming appointment found for “${parsed.clientName}”.`
                    : 'No upcoming appointment found.',
            }
        }
        store.setPendingConfirm({
            kind: 'send_reminder',
            appointmentId: appt.id,
            title: appt.title,
            clientName: appt.clients?.name ?? parsed.clientName,
        })
        return {
            reply: `Send reminder for **${appt.title}**${appt.clients?.name ? ` to **${appt.clients.name}**` : ''}?`,
            chips: [
                { label: 'Yes, send reminder', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    // ─── Timer control via chat ─────────────────────────────────────────
    if (parsed.kind === 'start_timer') {
        const taskQuery = parsed.task?.trim()
        // Try to resolve a task by name if provided
        if (taskQuery) {
            let tasks = await apiTasks(null)
            let resolved = resolveTaskMatch(taskQuery, tasks)
            if (resolved.ok === false && resolved.reason === 'none') {
                // Try global search
                tasks = await apiTasks(null)
                resolved = resolveTaskMatch(taskQuery, tasks)
            }
            if (resolved.ok === false && resolved.reason === 'ambiguous') {
                return {
                    reply: `Multiple tasks match “${taskQuery}”. Pick one to start:`,
                    chips: resolved.candidates.map((c) => ({
                        label: `${c.title} (${c.projects?.title ?? 'project'})`,
                        payload: `start timer for ${c.title}`,
                    })),
                }
            }
            if (resolved.ok === false) {
                return { reply: `No task matching “${taskQuery}”. Create it first with **add task ${taskQuery}**.` }
            }
            const task = resolved.task
            const { startTimerViaAi } = await import('./timer-ai-actions')
            const result = await startTimerViaAi({ taskId: task.id })
            if (!result.ok) return { reply: `Could not start timer: ${result.message}` }
            window.dispatchEvent(new Event('soloos:time-refresh'))
            return { reply: `Started timer for **${task.title}**.` }
        }

        const { startTimerViaAi } = await import('./timer-ai-actions')
        const result = await startTimerViaAi({})
        if (!result.ok) return { reply: `Could not start timer: ${result.message}` }
        window.dispatchEvent(new Event('soloos:time-refresh'))
        return { reply: 'Started timer.' }
    }

    if (parsed.kind === 'stop_timer') {
        try {
            const { stopTimerViaAi } = await import('./timer-ai-actions')
            const result = await stopTimerViaAi()
            if (!result.ok) return { reply: `Could not stop timer: ${result.message}` }
            window.dispatchEvent(new Event('soloos:time-refresh'))
            return { reply: result.message.startsWith('Stopped') ? `Stopped timer.` : result.message }
        } catch {
            return { reply: 'Failed to stop timer.' }
        }
    }

    if (parsed.kind === 'mark_task') {
        const pid = store.taskBoardProjectId
        let tasks = await apiTasks(pid)
        let resolved = resolveTaskMatch(parsed.title, tasks)
        if (resolved.ok === false && resolved.reason === 'none' && pid) {
            tasks = await apiTasks(null)
            resolved = resolveTaskMatch(parsed.title, tasks)
        }
        if (resolved.ok === false && resolved.reason === 'none') {
            return {
                reply: `No matching task for “${parsed.title}”. Try **show tasks in [project]** first, or be more specific.`,
            }
        }
        if (resolved.ok === false && resolved.reason === 'ambiguous') {
            const next = mapTaskStatus(parsed.status)
            return {
                reply: `Multiple tasks match “${parsed.title}”. Pick one:`,
                chips: resolved.candidates.map((c) => ({
                    label: `${c.title} (${c.projects?.title ?? 'project'})`,
                    payload: `__pm:mark:${c.id}:${next}`,
                })),
            }
        }
        const task = resolved.task
        const next = mapTaskStatus(parsed.status)
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Update failed: ${json.error || res.statusText}` }
        const prev = task.status
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Marked “${task.title}” as ${next}`, async () => {
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('soloos:pm-refresh'))
        return { reply: `Updated **${task.title}** → **${next}**.` }
    }

    return { reply: 'Use **help** to see what I can run here.' }
}
