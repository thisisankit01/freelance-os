import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import type { ParsedPmCommand } from '@/lib/pm-command-parser'

const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
})

type AiPmIntent =
    | {
    kind: 'ask_clarification'
    confidence: number
    reply: string
    chips?: { label: string; payload: string }[]
}
    | { kind: 'none'; confidence: number; reason?: string }
    | { kind: 'help'; confidence: number }
    | { kind: 'clear_filters'; confidence: number }
    | { kind: 'list_projects'; confidence: number }
    | { kind: 'behind_schedule_projects'; confidence: number }
    | { kind: 'current_context'; confidence: number }
    | { kind: 'summary'; confidence: number }
    | { kind: 'create_project'; name: string; confidence: number }
    | { kind: 'open_project_editor'; name: string; confidence: number }
    | {
    kind: 'update_project'
    name: string
    updates: {
        title?: string
        description?: string
        budget?: number | null
        deadline?: string | null
        clientName?: string | null
        status?: string
    }
    confidence: number
}
    | { kind: 'rename_project'; from: string; to: string; confidence: number }
    | { kind: 'delete_project'; name: string; confidence: number }
    | { kind: 'show_project_profit'; projectName?: string; confidence: number }
    | { kind: 'show_tasks'; projectName?: string; all?: boolean; confidence: number }
    | { kind: 'filter_tasks_status'; status: string; confidence: number }
    | { kind: 'add_task'; title: string; projectName?: string; confidence: number }
    | {
    kind: 'update_task'
    title: string
    updates: { title?: string; estimatedHours?: number | null; dueDate?: string | null; status?: string }
    confidence: number
}
    | { kind: 'mark_task'; title: string; status: string; confidence: number }
    | { kind: 'delete_task'; title: string; confidence: number }
    | {
    kind: 'set_project_status'
    projectRef: { kind: 'named'; name: string } | { kind: 'current' }
    status: string
    confidence: number
}
    | { kind: 'list_clients'; search?: string; status?: string; city?: string; confidence: number }
    | { kind: 'list_invoices'; confidence: number }
    | { kind: 'show_invoice'; invoiceNumber?: string; clientName?: string; confidence: number }
    | { kind: 'mark_invoice_status'; invoiceNumber?: string; clientName?: string; status: string; confidence: number }
    | { kind: 'create_invoice'; clientName: string; amount?: number; description?: string; confidence: number }
    | { kind: 'email_invoice'; invoiceNumber?: string; clientName?: string; confidence: number }
    | { kind: 'send_reminder'; clientName?: string; confidence: number }
    | { kind: 'start_timer'; task?: string; confidence: number }
    | { kind: 'stop_timer'; confidence: number }
    | (ParsedPmCommand & { confidence: number })

const ALLOWED_KINDS = new Set([
    'ask_clarification',
    'none',
    'help',
    'clear_filters',
    'list_projects',
    'behind_schedule_projects',
    'current_context',
    'summary',
    'create_project',
    'open_project_editor',
    'update_project',
    'rename_project',
    'delete_project',
    'show_project_profit',
    'show_tasks',
    'filter_tasks_status',
    'add_task',
    'update_task',
    'mark_task',
    'delete_task',
    'set_project_status',
    'list_clients',
    'list_invoices',
    'show_invoice',
    'mark_invoice_status',
    'create_invoice',
    'email_invoice',
    'send_reminder',
    'start_timer',
    'stop_timer',
    'list_inventory',
    'add_inventory',
    'update_inventory_quantity',
    'list_expenses',
    'add_expense',
    'show_profit_loss',
    'list_team',
    'add_team_member',
    'list_payouts',
    'add_payout',
    'list_assignments',
    'assign_work',
    'list_invoice_templates',
    'create_invoice_template',
    'update_invoice_template',
    'list_documents',
    'draft_contract',
    'draft_legal_notice',
    'send_document',
    'list_payment_links',
    'create_payment_link',
])

const PROJECT_STATUSES = new Set(['not_started', 'in_progress', 'review', 'done', 'on_hold'])
const TASK_STATUSES = new Set(['todo', 'in_progress', 'done', 'blocked', 'overdue'])

function cleanJson(raw: string) {
    return raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
}

function normalizeProjectStatus(raw: unknown) {
    if (typeof raw !== 'string') return undefined
    const s = raw.toLowerCase().trim().replace(/[-\s]+/g, '_')
    if (['complete', 'completed', 'finished', 'closed', 'shipped'].includes(s)) return 'done'
    if (['progress', 'doing', 'wip', 'working'].includes(s)) return 'in_progress'
    if (['hold', 'paused', 'pause'].includes(s)) return 'on_hold'
    if (['backlog', 'planned', 'new'].includes(s)) return 'not_started'
    if (PROJECT_STATUSES.has(s)) return s
    return undefined
}

function normalizeTaskStatus(raw: unknown) {
    if (typeof raw !== 'string') return undefined
    const s = raw.toLowerCase().trim().replace(/[-\s]+/g, '_')
    if (['complete', 'completed', 'finished', 'closed'].includes(s)) return 'done'
    if (['pending', 'to_do', 'to-do'].includes(s)) return 'todo'
    if (['progress', 'doing', 'wip', 'working'].includes(s)) return 'in_progress'
    if (TASK_STATUSES.has(s)) return s
    return undefined
}

function cleanTitle(raw: unknown) {
    if (typeof raw !== 'string') return undefined
    const value = raw
        .trim()
        .replace(/\s+(task|todo|to-do|item)$/i, '')
        .replace(/\s+project$/i, '')
        .trim()

    return value || undefined
}

function sanitizeChips(raw: unknown) {
    if (!Array.isArray(raw)) return undefined

    const chips = raw
        .filter((c): c is Record<string, unknown> => typeof c === 'object' && c !== null)
        .map((c) => ({
            label: typeof c.label === 'string' ? c.label.trim() : '',
            payload: typeof c.payload === 'string' ? c.payload.trim() : '',
        }))
        .filter((c) => c.label && c.payload)
        .slice(0, 6)

    return chips.length > 0 ? chips : undefined
}

function sanitizeIntent(raw: Record<string, unknown>): AiPmIntent {
    const kind = typeof raw.kind === 'string' && ALLOWED_KINDS.has(raw.kind) ? raw.kind : 'none'
    const confidenceRaw = typeof raw.confidence === 'number' ? raw.confidence : 0
    const confidence = Math.max(0, Math.min(1, confidenceRaw))

    if (kind === 'ask_clarification') {
        return {
            kind,
            confidence,
            reply:
                typeof raw.reply === 'string' && raw.reply.trim()
                    ? raw.reply.trim()
                    : 'I need one more detail before I do that.',
            chips: sanitizeChips(raw.chips),
        }
    }

    if (kind === 'none') {
        return {
            kind: 'none',
            confidence,
            reason: typeof raw.reason === 'string' ? raw.reason : undefined,
        }
    }

    if (kind === 'help') return { kind, confidence }
    if (kind === 'clear_filters') return { kind, confidence }
    if (kind === 'list_projects') return { kind, confidence }
    if (kind === 'behind_schedule_projects') return { kind, confidence }
    if (kind === 'current_context') return { kind, confidence }
    if (kind === 'summary') return { kind, confidence }
    if (kind === 'list_invoices') return { kind, confidence }
    if (kind === 'stop_timer') return { kind, confidence }

    if (kind === 'create_project') {
        const name = cleanTitle(raw.name)
        return name ? { kind, name, confidence } : { kind: 'none', confidence: 0, reason: 'Missing project name' }
    }

    if (kind === 'open_project_editor') {
        const name = cleanTitle(raw.name)
        return name ? { kind, name, confidence } : { kind: 'none', confidence: 0, reason: 'Missing project name' }
    }

    if (kind === 'show_project_profit') {
        const projectName = cleanTitle(raw.projectName)
        return { kind, ...(projectName ? { projectName } : {}), confidence }
    }

    if (kind === 'update_project') {
        const name = cleanTitle(raw.name)
        const rawUpdates =
            typeof raw.updates === 'object' && raw.updates !== null
                ? (raw.updates as Record<string, unknown>)
                : {}
        const status = normalizeProjectStatus(rawUpdates.status)
        const budget = typeof rawUpdates.budget === 'number' ? rawUpdates.budget : undefined
        const deadline =
            typeof rawUpdates.deadline === 'string' ? rawUpdates.deadline.trim() : rawUpdates.deadline === null ? null : undefined
        const title = cleanTitle(rawUpdates.title)
        const description = typeof rawUpdates.description === 'string' ? rawUpdates.description.trim() : undefined
        const clientName =
            typeof rawUpdates.clientName === 'string' ? rawUpdates.clientName.trim() : rawUpdates.clientName === null ? null : undefined
        const updates = {
            ...(title ? { title } : {}),
            ...(description ? { description } : {}),
            ...(budget !== undefined ? { budget } : {}),
            ...(deadline !== undefined ? { deadline } : {}),
            ...(clientName !== undefined ? { clientName } : {}),
            ...(status ? { status } : {}),
        }
        return name && Object.keys(updates).length > 0
            ? { kind, name, updates, confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing project update fields' }
    }

    if (kind === 'rename_project') {
        const from = cleanTitle(raw.from)
        const to = cleanTitle(raw.to)
        return from && to ? { kind, from, to, confidence } : { kind: 'none', confidence: 0, reason: 'Missing rename fields' }
    }

    if (kind === 'delete_project') {
        const name = cleanTitle(raw.name)
        return name ? { kind, name, confidence } : { kind: 'none', confidence: 0, reason: 'Missing project name' }
    }

    if (kind === 'show_tasks') {
        const projectName = cleanTitle(raw.projectName)
        const all = raw.all === true
        return { kind, ...(projectName ? { projectName } : {}), ...(all ? { all: true } : {}), confidence }
    }

    if (kind === 'filter_tasks_status') {
        const status = normalizeTaskStatus(raw.status)
        return status ? { kind, status, confidence } : { kind: 'none', confidence: 0, reason: 'Invalid task status' }
    }

    if (kind === 'add_task') {
        const title = cleanTitle(raw.title)
        const projectName = cleanTitle(raw.projectName)
        return title
            ? { kind, title, ...(projectName ? { projectName } : {}), confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing task title' }
    }

    if (kind === 'update_task') {
        const title = cleanTitle(raw.title)
        const rawUpdates =
            typeof raw.updates === 'object' && raw.updates !== null
                ? (raw.updates as Record<string, unknown>)
                : {}
        const nextTitle = cleanTitle(rawUpdates.title)
        const status = normalizeTaskStatus(rawUpdates.status)
        const estimatedHours =
            typeof rawUpdates.estimatedHours === 'number' ? rawUpdates.estimatedHours : undefined
        const dueDate =
            typeof rawUpdates.dueDate === 'string' ? rawUpdates.dueDate.trim() : rawUpdates.dueDate === null ? null : undefined
        const updates = {
            ...(nextTitle ? { title: nextTitle } : {}),
            ...(estimatedHours !== undefined ? { estimatedHours } : {}),
            ...(dueDate !== undefined ? { dueDate } : {}),
            ...(status ? { status } : {}),
        }
        return title && Object.keys(updates).length > 0
            ? { kind, title, updates, confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing task update fields' }
    }

    if (kind === 'mark_task') {
        const title = cleanTitle(raw.title)
        const status = normalizeTaskStatus(raw.status)
        return title && status
            ? { kind, title, status, confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing task title or status' }
    }

    if (kind === 'delete_task') {
        const title = cleanTitle(raw.title)
        return title ? { kind, title, confidence } : { kind: 'none', confidence: 0, reason: 'Missing task title' }
    }

    if (kind === 'set_project_status') {
        const status = normalizeProjectStatus(raw.status)
        const rawRef =
            typeof raw.projectRef === 'object' && raw.projectRef !== null
                ? (raw.projectRef as Record<string, unknown>)
                : {}

        const refKind = rawRef.kind === 'current' ? 'current' : 'named'
        const name = cleanTitle(rawRef.name)

        if (!status) return { kind: 'none', confidence: 0, reason: 'Invalid project status' }
        if (refKind === 'current') return { kind, projectRef: { kind: 'current' }, status, confidence }
        if (name) return { kind, projectRef: { kind: 'named', name }, status, confidence }

        return { kind: 'none', confidence: 0, reason: 'Missing project name' }
    }

    if (kind === 'list_clients') {
        const search = cleanTitle(raw.search)
        const city = cleanTitle(raw.city)
        const status = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : undefined

        return {
            kind,
            ...(search ? { search } : {}),
            ...(city ? { city } : {}),
            ...(status === 'active' || status === 'inactive' ? { status } : {}),
            confidence,
        }
    }

    if (kind === 'create_invoice') {
        const clientName = cleanTitle(raw.clientName)
        const amount = typeof raw.amount === 'number' ? raw.amount : undefined
        const description = typeof raw.description === 'string' ? raw.description.trim() : undefined

        if (clientName && (!amount || amount <= 0)) {
            return {
                kind: 'ask_clarification',
                confidence: Math.max(confidence, 0.75),
                reply: `What amount should I put on the invoice for ${clientName}?`,
                chips: [
                    { label: '5,000', payload: `create invoice for ${clientName} 5000` },
                    { label: '10,000', payload: `create invoice for ${clientName} 10000` },
                ],
            }
        }

        return clientName
            ? { kind, clientName, ...(amount ? { amount } : {}), ...(description ? { description } : {}), confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing client name' }
    }

    if (kind === 'show_invoice') {
        const invoiceNumber = cleanTitle(raw.invoiceNumber)
        const clientName = cleanTitle(raw.clientName)
        return invoiceNumber || clientName
            ? { kind, ...(invoiceNumber ? { invoiceNumber } : {}), ...(clientName ? { clientName } : {}), confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing invoice target' }
    }

    if (kind === 'mark_invoice_status') {
        const invoiceNumber = cleanTitle(raw.invoiceNumber)
        const clientName = cleanTitle(raw.clientName)
        const status = typeof raw.status === 'string' ? raw.status.trim().toLowerCase() : ''
        const allowed = ['draft', 'sent', 'paid', 'overdue']
        return (invoiceNumber || clientName) && allowed.includes(status)
            ? { kind, ...(invoiceNumber ? { invoiceNumber } : {}), ...(clientName ? { clientName } : {}), status, confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing invoice status fields' }
    }

    if (kind === 'email_invoice') {
        const invoiceNumber = cleanTitle(raw.invoiceNumber)
        const clientName = cleanTitle(raw.clientName)
        if (!invoiceNumber && !clientName) {
            return {
                kind: 'ask_clarification',
                confidence: Math.max(confidence, 0.75),
                reply: 'Which invoice should I send?',
                chips: [{ label: 'Show invoices', payload: 'show invoices' }],
            }
        }
        return { kind, ...(invoiceNumber ? { invoiceNumber } : {}), ...(clientName ? { clientName } : {}), confidence }
    }

    if (kind === 'send_reminder') {
        const clientName = cleanTitle(raw.clientName)
        return { kind, ...(clientName ? { clientName } : {}), confidence }
    }

    if (kind === 'start_timer') {
        const task = cleanTitle(raw.task)
        return { kind, ...(task ? { task } : {}), confidence }
    }

    if (kind === 'list_inventory') return { kind, lowStock: raw.lowStock === true, confidence }
    if (kind === 'add_inventory') {
        const itemName = cleanTitle(raw.itemName)
        const quantity = typeof raw.quantity === 'number' ? raw.quantity : undefined
        const unitCost = typeof raw.unitCost === 'number' ? raw.unitCost : undefined
        const category = cleanTitle(raw.category)
        return itemName
            ? { kind, itemName, ...(quantity !== undefined ? { quantity } : {}), ...(unitCost !== undefined ? { unitCost } : {}), ...(category ? { category } : {}), confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing inventory item' }
    }
    if (kind === 'update_inventory_quantity') {
        const itemName = cleanTitle(raw.itemName)
        const quantity = typeof raw.quantity === 'number' ? raw.quantity : undefined
        return itemName && quantity !== undefined ? { kind, itemName, quantity, confidence } : { kind: 'none', confidence: 0, reason: 'Missing inventory quantity' }
    }
    if (kind === 'list_expenses') {
        const category = cleanTitle(raw.category)
        return { kind, ...(category ? { category } : {}), confidence }
    }
    if (kind === 'add_expense') {
        const category = cleanTitle(raw.category)
        const amount = typeof raw.amount === 'number' ? raw.amount : undefined
        const description = cleanTitle(raw.description)
        return category && amount
            ? { kind, category, amount, ...(description ? { description } : {}), confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing expense fields' }
    }
    if (kind === 'show_profit_loss') return { kind, confidence }
    if (kind === 'list_team') return { kind, confidence }
    if (kind === 'add_team_member') {
        const name = cleanTitle(raw.name)
        const role = cleanTitle(raw.role)
        const email = cleanTitle(raw.email)
        const payoutRate = typeof raw.payoutRate === 'number' ? raw.payoutRate : undefined
        return name ? { kind, name, ...(role ? { role } : {}), ...(email ? { email } : {}), ...(payoutRate ? { payoutRate } : {}), confidence } : { kind: 'none', confidence: 0, reason: 'Missing team member name' }
    }
    if (kind === 'list_payouts') {
        const status = cleanTitle(raw.status)
        return { kind, ...(status ? { status } : {}), confidence }
    }
    if (kind === 'add_payout') {
        const memberName = cleanTitle(raw.memberName)
        const amount = typeof raw.amount === 'number' ? raw.amount : undefined
        const notes = cleanTitle(raw.notes)
        return memberName && amount ? { kind, memberName, amount, ...(notes ? { notes } : {}), confidence } : { kind: 'none', confidence: 0, reason: 'Missing payout fields' }
    }
    if (kind === 'list_assignments') return { kind, confidence }
    if (kind === 'assign_work') {
        const taskTitle = cleanTitle(raw.taskTitle)
        const memberName = cleanTitle(raw.memberName)
        return taskTitle && memberName ? { kind, taskTitle, memberName, confidence } : { kind: 'none', confidence: 0, reason: 'Missing assignment fields' }
    }
    if (kind === 'list_invoice_templates') return { kind, confidence }
    if (kind === 'create_invoice_template') {
        const name = cleanTitle(raw.name)
        return name ? { kind, name, confidence } : { kind: 'none', confidence: 0, reason: 'Missing template name' }
    }
    if (kind === 'update_invoice_template') {
        const name = cleanTitle(raw.name)
        const updates = typeof raw.updates === 'object' && raw.updates !== null ? raw.updates as Record<string, unknown> : {}
        const subject = cleanTitle(updates.subject)
        const message = typeof updates.message === 'string' ? updates.message.trim() : undefined
        const terms = typeof updates.terms === 'string' ? updates.terms.trim() : undefined
        const footer = typeof updates.footer === 'string' ? updates.footer.trim() : undefined
        const accentColor = cleanTitle(updates.accentColor)
        const isDefault = typeof updates.isDefault === 'boolean' ? updates.isDefault : undefined
        const cleanUpdates = {
            ...(subject ? { subject } : {}),
            ...(message ? { message } : {}),
            ...(terms ? { terms } : {}),
            ...(footer ? { footer } : {}),
            ...(accentColor ? { accentColor } : {}),
            ...(isDefault !== undefined ? { isDefault } : {}),
        }
        return name && Object.keys(cleanUpdates).length
            ? { kind, name, updates: cleanUpdates, confidence }
            : { kind: 'none', confidence: 0, reason: 'Missing template update fields' }
    }
    if (kind === 'list_documents') {
        const documentType = raw.documentType === 'contract' || raw.documentType === 'legal_notice' ? raw.documentType : undefined
        return { kind, ...(documentType ? { documentType } : {}), confidence }
    }
    if (kind === 'draft_contract') {
        const clientName = cleanTitle(raw.clientName)
        const projectName = cleanTitle(raw.projectName)
        const title = cleanTitle(raw.title)
        const terms = typeof raw.terms === 'string' ? raw.terms.trim() : undefined
        return { kind, ...(clientName ? { clientName } : {}), ...(projectName ? { projectName } : {}), ...(title ? { title } : {}), ...(terms ? { terms } : {}), confidence }
    }
    if (kind === 'draft_legal_notice') {
        const clientName = cleanTitle(raw.clientName)
        const invoiceNumber = cleanTitle(raw.invoiceNumber)
        const title = cleanTitle(raw.title)
        return { kind, ...(clientName ? { clientName } : {}), ...(invoiceNumber ? { invoiceNumber } : {}), ...(title ? { title } : {}), confidence }
    }
    if (kind === 'send_document') {
        const documentType = raw.documentType === 'contract' || raw.documentType === 'legal_notice' ? raw.documentType : undefined
        const title = cleanTitle(raw.title)
        const clientName = cleanTitle(raw.clientName)
        return documentType || title || clientName
            ? { kind, ...(documentType ? { documentType } : {}), ...(title ? { title } : {}), ...(clientName ? { clientName } : {}), confidence }
            : { kind: 'ask_clarification', confidence: Math.max(confidence, 0.75), reply: 'Which saved contract or legal notice should I send?', chips: [{ label: 'Show documents', payload: 'show documents' }] }
    }
    if (kind === 'list_payment_links') return { kind, confidence }
    if (kind === 'create_payment_link') {
        const invoiceNumber = cleanTitle(raw.invoiceNumber)
        const clientName = cleanTitle(raw.clientName)
        return invoiceNumber || clientName
            ? { kind, ...(invoiceNumber ? { invoiceNumber } : {}), ...(clientName ? { clientName } : {}), confidence }
            : { kind: 'ask_clarification', confidence: Math.max(confidence, 0.75), reply: 'Which invoice should I create the payment link for?', chips: [{ label: 'Show invoices', payload: 'show invoices' }] }
    }

    return { kind: 'none', confidence: 0, reason: 'Unsupported intent' }
}

export async function POST(req: Request) {
    let body: Record<string, unknown> = {}

    try {
        body = await req.json()
    } catch {
        body = {}
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : ''
    const projects = Array.isArray(body.projects) ? body.projects.map(String).slice(0, 40) : []
    const tasks = Array.isArray(body.tasks) ? body.tasks.map(String).slice(0, 80) : []
    const clients = Array.isArray(body.clients) ? body.clients.map(String).slice(0, 40) : []

    if (!prompt) {
        return Response.json({ kind: 'none', confidence: 0, reason: 'Empty prompt' })
    }

    if (!process.env.OPENROUTER_API_KEY) {
        return Response.json({ kind: 'none', confidence: 0, reason: 'AI key missing' })
    }

    const system = `You are the intent parser for SoloOS, a chat-first freelance business app.

Your job:
Convert the user's natural language into ONE structured command JSON.
Return ONLY valid JSON. No markdown. No explanation.

IMPORTANT PRODUCT RULE:
When confident and enough information exists, return an executable command.
When the intent is understandable but information is missing, return ask_clarification.
Never guess important missing details.

Available command shapes:

0. {"kind":"ask_clarification","reply":"What amount should I put on the invoice?","chips":[{"label":"₹5,000","payload":"create invoice for Rahul 5000"}],"confidence":0.8}

1. {"kind":"list_projects","confidence":0.9}
2. {"kind":"behind_schedule_projects","confidence":0.9}
3. {"kind":"create_project","name":"Website Redesign","confidence":0.9}
4. {"kind":"open_project_editor","name":"Website Redesign","confidence":0.9}
5. {"kind":"update_project","name":"Website Redesign","updates":{"budget":50000,"deadline":"2026-06-30","clientName":"Rahul","description":"Landing page build"},"confidence":0.9}
6. {"kind":"rename_project","from":"Old Name","to":"New Name","confidence":0.9}
7. {"kind":"delete_project","name":"Project Name","confidence":0.9}
8. {"kind":"set_project_status","projectRef":{"kind":"named","name":"Project Name"},"status":"review","confidence":0.9}
9. {"kind":"set_project_status","projectRef":{"kind":"current"},"status":"on_hold","confidence":0.9}

Project statuses:
- not_started
- in_progress
- review
- done
- on_hold

10. {"kind":"show_project_profit","projectName":"Project Name","confidence":0.9}
11. {"kind":"show_tasks","projectName":"Project Name","confidence":0.9}
12. {"kind":"show_tasks","all":true,"confidence":0.9}
13. {"kind":"filter_tasks_status","status":"overdue","confidence":0.9}
14. {"kind":"add_task","title":"Task Title","projectName":"Project Name","confidence":0.9}
15. {"kind":"update_task","title":"Task Title","updates":{"title":"New Title","estimatedHours":4,"dueDate":"2026-06-30","status":"in_progress"},"confidence":0.9}
16. {"kind":"mark_task","title":"Task Title","status":"done","confidence":0.9}
17. {"kind":"delete_task","title":"Task Title","confidence":0.9}

Task statuses:
- todo
- in_progress
- done
- blocked
- overdue

18. {"kind":"start_timer","task":"Task Title","confidence":0.9}
19. {"kind":"stop_timer","confidence":0.9}

20. {"kind":"list_clients","search":"Client Name","confidence":0.9}
21. {"kind":"list_clients","status":"active","confidence":0.9}
22. {"kind":"list_clients","city":"Mumbai","confidence":0.9}
23. {"kind":"list_invoices","confidence":0.9}
24. {"kind":"show_invoice","invoiceNumber":"INV-001","confidence":0.9}
25. {"kind":"mark_invoice_status","invoiceNumber":"INV-001","status":"paid","confidence":0.9}
26. {"kind":"create_invoice","clientName":"Client Name","amount":5000,"description":"Work done","confidence":0.9}
27. {"kind":"email_invoice","invoiceNumber":"INV-001","clientName":"Client Name","confidence":0.9}
28. {"kind":"send_reminder","clientName":"Rahul","confidence":0.9}

Inventory / expenses / team / documents:
34. {"kind":"list_inventory","lowStock":true,"confidence":0.9}
35. {"kind":"add_inventory","itemName":"Camera Battery","quantity":4,"unitCost":1200,"category":"equipment","confidence":0.9}
36. {"kind":"update_inventory_quantity","itemName":"Camera Battery","quantity":8,"confidence":0.9}
37. {"kind":"list_expenses","category":"software","confidence":0.9}
38. {"kind":"add_expense","category":"software","amount":999,"description":"Figma subscription","confidence":0.9}
39. {"kind":"show_profit_loss","confidence":0.9}
40. {"kind":"list_team","confidence":0.9}
41. {"kind":"add_team_member","name":"Aman","role":"designer","payoutRate":5000,"confidence":0.9}
42. {"kind":"list_payouts","status":"owed","confidence":0.9}
43. {"kind":"add_payout","memberName":"Aman","amount":5000,"notes":"Logo work","confidence":0.9}
44. {"kind":"list_assignments","confidence":0.9}
45. {"kind":"assign_work","taskTitle":"Homepage design","memberName":"Aman","confidence":0.9}
46. {"kind":"list_invoice_templates","confidence":0.9}
47. {"kind":"create_invoice_template","name":"Premium","confidence":0.9}
48. {"kind":"update_invoice_template","name":"Premium","updates":{"message":"Hi {{clientName}}, attached is invoice {{invoiceNumber}}.","subject":"Invoice {{invoiceNumber}}","terms":"Due in 7 days","accentColor":"#2563eb","isDefault":true},"confidence":0.9}
49. {"kind":"list_documents","documentType":"contract","confidence":0.9}
50. {"kind":"draft_contract","clientName":"Rahul","projectName":"Website","confidence":0.9}
51. {"kind":"draft_legal_notice","clientName":"Rahul","invoiceNumber":"INV-001","confidence":0.9}
52. {"kind":"send_document","documentType":"contract","clientName":"Rahul","confidence":0.9}
53. {"kind":"list_payment_links","confidence":0.9}
54. {"kind":"create_payment_link","invoiceNumber":"INV-001","confidence":0.9}

General:
29. {"kind":"summary","confidence":0.9}
30. {"kind":"current_context","confidence":0.9}
31. {"kind":"clear_filters","confidence":0.9}
32. {"kind":"help","confidence":0.9}
33. {"kind":"none","confidence":0.0,"reason":"why"}

Clarification behavior:
Ask clarification when:
- User wants to create an invoice but client or amount is missing.
- User wants to add a task but project is missing and no current project is obvious.
- User says "finish design" and multiple known tasks contain design.
- User says "move this" but no current project/task context exists.
- User asks to send/delete/legal/payment action and confirmation or missing target is required.
- User asks something business-related but the exact object is unclear.

Meaning examples:
- "wrap up homepage design" -> mark_task done
- "homepage design is finished" -> mark_task done
- "complete homepage design task" -> mark_task done, title "Homepage design"
- "start working on logo" -> start_timer task "Logo"
- "track logo design" -> start_timer
- "move website to review" -> set_project_status review
- "edit website project" -> open_project_editor
- "set website budget to 50000" -> update_project budget
- "change homepage task due date to 2026-06-30" -> update_task dueDate
- "send website for review" -> set_project_status review
- "pause acme website" -> set_project_status on_hold
- "resume acme website" -> set_project_status in_progress
- "what is late" -> behind_schedule_projects
- "who is unpaid" -> list_invoices
- "make bill for Rahul 5000" -> create_invoice
- "make bill for Rahul" -> ask_clarification for amount
- "mark invoice INV-001 paid" -> mark_invoice_status paid
- "remind Rahul about tomorrow's call" -> send_reminder
- "add inventory camera battery quantity 4" -> add_inventory
- "log expense software 999 for Figma" -> add_expense
- "add team member Aman designer" -> add_team_member
- "assign homepage task to Aman" -> assign_work
- "draft contract for Rahul project Website" -> draft_contract
- "draft legal notice for Rahul invoice INV-001" -> draft_legal_notice
- "send contract to Rahul" -> send_document, documentType contract, clientName Rahul
- "send legal notice to Rahul" -> send_document, documentType legal_notice, clientName Rahul
- "set premium template message to Hi {{clientName}}" -> update_invoice_template
- "make premium template default" -> update_invoice_template isDefault true
- "create payment link for invoice INV-001" -> create_payment_link
- "create invoice" -> ask_clarification for client and amount
- "add task homepage" -> ask_clarification for project if no project is obvious
- "finish design" with many design tasks -> ask_clarification with task chips

Rules:
- Use the closest existing project/task/client name when obvious.
- Do NOT invent database IDs.
- Do NOT invent amounts, dates, client names, project names, invoice numbers, or recipients.
- Do NOT return destructive commands unless the user clearly asks delete/remove.
- If the user asks to send WhatsApp or live Razorpay collection, return ask_clarification explaining external setup is required.
- If the user asks to send a saved contract or legal notice and target is clear, return send_document. The app will ask confirmation before sending.
- Keep confidence realistic.
- If unclear, return kind none.`

    const user = `User message: "${prompt}"

Known projects:
${projects.length ? projects.map((p) => `- ${p}`).join('\n') : '- none'}

Known tasks:
${tasks.length ? tasks.map((t) => `- ${t}`).join('\n') : '- none'}

Known clients:
${clients.length ? clients.map((c) => `- ${c}`).join('\n') : '- none'}

Return one JSON object only.`

    try {
        const result = await generateText({
            model: openrouter('google/gemini-2.0-flash-001'),
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            temperature: 0.1,
            maxOutputTokens: 450,
        })

        const raw = cleanJson(result.text ?? '')
        const match = raw.match(/\{[\s\S]*\}/)

        if (!match) {
            return Response.json({ kind: 'none', confidence: 0, reason: 'No JSON returned' })
        }

        const parsed = JSON.parse(match[0]) as Record<string, unknown>
        return Response.json(sanitizeIntent(parsed))
    } catch (error) {
        return Response.json({
            kind: 'none',
            confidence: 0,
            reason: error instanceof Error ? error.message : 'AI intent failed',
        })
    }
}
