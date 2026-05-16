/**
 * Client-side PM command parser — returns structured intent or null (fallback to Aria).
 */

export type ParsedPmCommand =
    | { kind: 'help' }
    | { kind: 'clear_filters' }
    | { kind: 'list_projects' }
    | { kind: 'behind_schedule_projects' }
    | { kind: 'current_context' }
    | { kind: 'confirm_yes' }
    | { kind: 'confirm_no' }
    | { kind: 'undo' }
    | { kind: 'summary' }
    | { kind: 'create_project'; name: string }
    | { kind: 'open_project_editor'; name: string }
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
}
    | { kind: 'rename_project'; from: string; to: string }
    | { kind: 'delete_project'; name: string }
    | { kind: 'show_project_profit'; projectName?: string }
    | { kind: 'show_tasks'; projectName?: string; all?: boolean }
    | { kind: 'filter_tasks_status'; status: string }
    | { kind: 'add_task'; title: string; projectName?: string }
    | {
    kind: 'update_task'
    title: string
    updates: {
        title?: string
        estimatedHours?: number | null
        dueDate?: string | null
        status?: string
    }
}
    | { kind: 'mark_task'; title: string; status: string }
    | { kind: 'mark_task_by_id'; taskId: string; status: string }
    | { kind: 'delete_task'; title: string }
    | { kind: 'delete_task_by_id'; taskId: string }
    | { kind: 'mark_all_tasks'; projectName?: string; status: string }
    | { kind: 'set_project_status'; projectRef: { kind: 'named'; name: string } | { kind: 'current' } | { kind: 'id'; id: string }; status: string }
    | { kind: 'list_clients'; search?: string; status?: string; city?: string }
    | { kind: 'list_invoices' }
    | { kind: 'show_invoice'; invoiceNumber?: string; clientName?: string }
    | { kind: 'mark_invoice_status'; invoiceNumber?: string; clientName?: string; status: string }
    | { kind: 'create_invoice'; clientName: string; amount?: number; description?: string }
    | { kind: 'email_invoice'; invoiceNumber?: string; clientName?: string }
    | { kind: 'send_reminder'; clientName?: string }
    | { kind: 'start_timer'; task?: string }
    | { kind: 'stop_timer' }
    | { kind: 'list_inventory'; lowStock?: boolean }
    | { kind: 'add_inventory'; itemName: string; quantity?: number; unitCost?: number; category?: string; lowStockThreshold?: number }
    | { kind: 'update_inventory_quantity'; itemName: string; quantity: number }
    | { kind: 'list_expenses'; category?: string }
    | { kind: 'add_expense'; category: string; amount: number; description?: string; gstAmount?: number; date?: string }
    | { kind: 'show_profit_loss' }
    | { kind: 'list_team' }
    | { kind: 'add_team_member'; name: string; role?: string; email?: string; payoutRate?: number }
    | { kind: 'list_payouts'; status?: string }
    | { kind: 'add_payout'; memberName: string; amount: number; notes?: string }
    | { kind: 'list_assignments' }
    | { kind: 'assign_work'; taskTitle: string; memberName: string }
    | { kind: 'list_invoice_templates' }
    | { kind: 'create_invoice_template'; name: string; subject?: string; message?: string; terms?: string; accentColor?: string }
    | {
    kind: 'update_invoice_template'
    name: string
    updates: { subject?: string; message?: string; terms?: string; footer?: string; accentColor?: string; isDefault?: boolean }
}
    | { kind: 'list_documents'; documentType?: 'contract' | 'legal_notice' }
    | { kind: 'draft_contract'; clientName?: string; projectName?: string; title?: string; terms?: string }
    | { kind: 'draft_legal_notice'; clientName?: string; invoiceNumber?: string; title?: string }
    | { kind: 'send_document'; documentType?: 'contract' | 'legal_notice'; title?: string; clientName?: string }
    | { kind: 'list_payment_links' }
    | { kind: 'create_payment_link'; invoiceNumber?: string; clientName?: string }

function norm(s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Strip wrapping [brackets] from UI placeholders like "[project]" */
export function stripPlaceholderBrackets(s: string) {
    const t = s.trim()
    if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim()
    return t
}

export function cleanTaskTitle(raw: string) {
    return stripPlaceholderBrackets(raw)
        .replace(/\s+(task|todo|to-do|item)$/i, '')
        .trim()
}

/** Project board column keys — must match ProjectBoard / API */
export function mapProjectStatus(raw: string): string {
    const s = raw.toLowerCase().trim()
    if (s === 'hold' || s === 'on hold' || s === 'on_hold' || s === 'paused' || s === 'pause') return 'on_hold'
    if (s === 'not started' || s === 'not_started' || s === 'backlog' || s === 'planned' || s === 'new')
        return 'not_started'
    if (s === 'in progress' || s === 'in_progress' || s === 'progress' || s === 'wip' || s === 'doing') return 'in_progress'
    if (s === 'review' || s === 'in review' || s === 'qa') return 'review'
    if (s === 'done' || s === 'completed' || s === 'complete' || s === 'shipped') return 'done'
    return s.replace(/\s+/g, '_')
}

/** Map natural language status to DB task.status */
export function mapTaskStatus(raw: string): string {
    const s = raw.toLowerCase().trim()
    if (s === 'done' || s === 'completed' || s === 'complete') return 'done'
    if (s === 'todo' || s === 'to do' || s === 'to-do' || s === 'pending') return 'todo'
    if (s === 'in progress' || s === 'in_progress' || s === 'progress' || s === 'wip') return 'in_progress'
    if (s === 'blocked' || s === 'block') return 'blocked'
    return s.replace(/\s+/g, '_')
}

function parseAmount(raw: string | undefined) {
    if (!raw) return undefined
    const value = Number(raw.replace(/[,₹$]/g, '').trim())
    return Number.isFinite(value) ? value : undefined
}

function cleanDateValue(raw: string | undefined) {
    if (!raw) return undefined
    const v = stripPlaceholderBrackets(raw).trim()
    if (!v || /^(none|null|clear|remove|no deadline)$/i.test(v)) return null
    return v
}

export function parsePmCommand(input: string): ParsedPmCommand | null {
    const raw = input.trim()
    const t = norm(input)
    if (!t) return null

    // Chip payloads (internal)
    if (raw.startsWith('__pm:projstatus:')) {
        const rest = raw.slice('__pm:projstatus:'.length)
        const lastColon = rest.lastIndexOf(':')
        if (lastColon <= 0) return null
        const projectId = rest.slice(0, lastColon)
        const st = rest.slice(lastColon + 1).trim()
        if (!projectId || !st) return null
        return { kind: 'set_project_status', projectRef: { kind: 'id', id: projectId }, status: st }
    }
    if (raw.startsWith('__pm:mark:')) {
        const rest = raw.slice('__pm:mark:'.length)
        const lastColon = rest.lastIndexOf(':')
        if (lastColon <= 0) return null
        const taskId = rest.slice(0, lastColon)
        const statusRaw = rest.slice(lastColon + 1)
        if (!taskId) return null
        return { kind: 'mark_task_by_id', taskId, status: mapTaskStatus(statusRaw) }
    }
    if (raw.startsWith('__pm:delete:')) {
        const taskId = raw.slice('__pm:delete:'.length)
        if (!taskId) return null
        return { kind: 'delete_task_by_id', taskId }
    }

    if (/^(help|commands|\?|what can i do)\b/.test(t)) return { kind: 'help' }
    if (/^(undo|undo last)\b/.test(t)) return { kind: 'undo' }
    if (/^(yes|y|confirm|do it|go ahead)\b$/.test(t)) return { kind: 'confirm_yes' }
    if (/^(no|n|cancel|stop|abort)\b$/.test(t)) return { kind: 'confirm_no' }
    if (/^(what project|current context|where am i)\b/.test(t)) return { kind: 'current_context' }
    if (/^(status|summary|overview)\b/.test(t)) return { kind: 'summary' }

    if (/\b(projects?|work)\b.*\b(behind schedule|late|delayed|overdue|past deadline)\b/.test(t)) {
        return { kind: 'behind_schedule_projects' }
    }

    if (/^list (all )?projects\b|^show (my )?projects\b/.test(t)) return { kind: 'list_projects' }

    if (/\b(project profit|project profitability|earned per hour|hourly rate|revenue vs hours)\b/.test(t)) {
        const mProfit = t.match(/\b(?:on|for)\s+(.+)$/)
        return {
            kind: 'show_project_profit',
            projectName: mProfit ? stripPlaceholderBrackets(mProfit[1]!) : undefined,
        }
    }


    let m: RegExpMatchArray | null

    // create_project — flexible phrasing ("add a project name Ankit Pandey", "new project Foo")
    m = t.match(/^(?:create|add|new)\s+(?:a\s+)?project\s+(?:named|called|name)\s+(.+)$/)
    if (m) return { kind: 'create_project', name: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:create|new)\s+a\s+new\s+project\s+(?:(?:named|called|name)\s+)?(.+)$/)
    if (m) return { kind: 'create_project', name: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^new\s+project\s*[:\-–]?\s*(.+)$/)
    if (m) return { kind: 'create_project', name: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:create|new|add)\s+(?:a\s+)?project\s+(?:called\s+)?(.+)$/)
    if (m) return { kind: 'create_project', name: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:edit|open|modify|update|change)\s+(?:project\s+)?(.+?)(?:\s+project)?(?:\s+(?:settings|details|modal|form))?$/)
    if (m && !/\b(budget|deadline|description|client|customer|status)\b/.test(m[1]!)) {
        return { kind: 'open_project_editor', name: stripPlaceholderBrackets(m[1]!) }
    }

    m = t.match(/^rename\s+project\s+(.+?)\s+to\s+(.+)$/)
    if (m) return { kind: 'rename_project', from: stripPlaceholderBrackets(m[1]!), to: stripPlaceholderBrackets(m[2]!) }

    m = t.match(/^(?:set|update|change)\s+(?:project\s+)?(.+?)\s+budget\s+(?:to\s+)?([₹$]?[0-9,]+(?:\.[0-9]+)?)$/)
    if (m) return { kind: 'update_project', name: stripPlaceholderBrackets(m[1]!), updates: { budget: parseAmount(m[2]!) } }

    m = t.match(/^(?:set|update|change)\s+(?:project\s+)?(.+?)\s+deadline\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_project', name: stripPlaceholderBrackets(m[1]!), updates: { deadline: cleanDateValue(m[2]) } }

    m = t.match(/^(?:set|update|change)\s+(?:project\s+)?(.+?)\s+description\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_project', name: stripPlaceholderBrackets(m[1]!), updates: { description: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:assign|set|update|change)\s+(?:project\s+)?(.+?)\s+(?:client|customer)\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_project', name: stripPlaceholderBrackets(m[1]!), updates: { clientName: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:delete|remove)\s+project\s+(.+)$/)
    if (m) return { kind: 'delete_project', name: stripPlaceholderBrackets(m[1]!) }

    // Project status — "make this project on hold", "put project Acme in review"
    if (/^(?:make|put)\s+this\s+project\s+(?:on\s+)?hold\b/.test(t)) {
        return { kind: 'set_project_status', projectRef: { kind: 'current' }, status: mapProjectStatus('on_hold') }
    }
    m = t.match(/^(?:make|put|set|move)\s+this\s+project\s+(?:to|as)\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'current' },
            status: mapProjectStatus(stripPlaceholderBrackets(m[1]!)),
        }
    }
    m = t.match(/^(?:mark|set)\s+project\s+(.+?)\s+as\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: mapProjectStatus(stripPlaceholderBrackets(m[2]!)),
        }
    }
    m = t.match(/^(?:set|move|put)\s+project\s+(.+?)\s+to\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: mapProjectStatus(stripPlaceholderBrackets(m[2]!)),
        }
    }

    m = t.match(/^(?:set|move|put)\s+project\s+(.+?)\s+to\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: mapProjectStatus(stripPlaceholderBrackets(m[2]!)),
        }
    }

    m = t.match(/^(?:move|shift|drag|send|take)\s+(.+?)\s+(?:project\s+)?(?:to|into|in|for)\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: mapProjectStatus(stripPlaceholderBrackets(m[2]!)),
        }
    }

    m = t.match(/^(.+?)\s+project\s+(?:is\s+)?(done|completed|complete|finished|shipped|in progress|review|on hold|paused)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: mapProjectStatus(stripPlaceholderBrackets(m[2]!)),
        }
    }

    m = t.match(/^(?:complete|finish|close|ship)\s+project\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'done',
        }
    }

    m = t.match(/^(?:pause|hold)\s+project\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'on_hold',
        }
    }

    m = t.match(/^(?:resume|restart)\s+project\s+(.+)$/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'in_progress',
        }
    }

    m = t.match(/^(?:make|put)\s+project\s+(.+?)\s+(?:on\s+)?hold\b/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'on_hold',
        }
    }

    m = t.match(/^(?:make|put)\s+(.+?)\s+(?:project\s+)?(?:on\s+)?hold\b/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'on_hold',
        }
    }

    m = t.match(/^(?:make|put)\s+project\s+(.+?)\s+(?:on\s+)?hold\b/)
    if (m) {
        return {
            kind: 'set_project_status',
            projectRef: { kind: 'named', name: stripPlaceholderBrackets(m[1]!) },
            status: 'on_hold',
        }
    }
    m = t.match(/^(?:start|begin|resume)\s+(?:a\s+)?timer(?:\s+for\s+(.+))?$/)
    if (m) {
        const task = m[1] ? stripPlaceholderBrackets(m[1]!) : undefined
        return { kind: 'start_timer', task }
    }

    m = t.match(/^(?:track|start tracking|begin tracking|log time for|start work on|begin working on|work on)\s+(.+)$/)
    if (m) {
        return { kind: 'start_timer', task: stripPlaceholderBrackets(m[1]!) }
    }

    if (/^(?:stop|end|pause)\s+(?:the\s+)?timer\b/.test(t)) return { kind: 'stop_timer' }

    if (/^(?:stop tracking|pause tracking|end tracking|end my session|stop my session|pause my session)\b/.test(t)) {
        return { kind: 'stop_timer' }
    }

    if (/^(?:show|list|open)\s+(?:my\s+)?inventory\b/.test(t)) {
        return { kind: 'list_inventory', lowStock: /\blow\s+stock\b/.test(t) }
    }
    if (/^(?:show|list|open)\s+low\s+stock\b/.test(t)) return { kind: 'list_inventory', lowStock: true }

    m = t.match(/^(?:add|create)\s+(?:inventory|stock|item)\s+(.+?)(?:\s+(?:qty|quantity)\s+(\d+))?(?:\s+(?:cost|rate|price)\s+([₹$]?[0-9,]+(?:\.[0-9]+)?))?(?:\s+(?:category)\s+(.+))?$/)
    if (m) return {
        kind: 'add_inventory',
        itemName: stripPlaceholderBrackets(m[1]!),
        quantity: m[2] ? Number(m[2]) : undefined,
        unitCost: parseAmount(m[3]),
        category: m[4] ? stripPlaceholderBrackets(m[4]) : undefined,
    }

    m = t.match(/^(?:set|update|change)\s+(?:inventory|stock|item)\s+(.+?)\s+(?:qty|quantity|stock)\s+(?:to\s+)?(\d+)$/)
    if (m) return { kind: 'update_inventory_quantity', itemName: stripPlaceholderBrackets(m[1]!), quantity: Number(m[2]) }

    if (/^(?:show|list|open)\s+(?:my\s+)?expenses\b/.test(t)) return { kind: 'list_expenses' }
    m = t.match(/^(?:show|list|open)\s+(.+?)\s+expenses\b/)
    if (m) return { kind: 'list_expenses', category: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:add|log|create)\s+expense\s+(.+?)\s+([₹$]?[0-9,]+(?:\.[0-9]+)?)(?:\s+(?:for|on)\s+(.+))?$/)
    if (m) return {
        kind: 'add_expense',
        category: stripPlaceholderBrackets(m[1]!),
        amount: parseAmount(m[2]!) ?? 0,
        description: m[3] ? stripPlaceholderBrackets(m[3]) : undefined,
    }

    if (/^(?:show|open)\s+(?:profit\s*(?:and|&)\s*loss|p&l|pl)\b/.test(t)) return { kind: 'show_profit_loss' }

    if (/^(?:show|list|open)\s+(?:team|subcontractors|staff)\b/.test(t)) return { kind: 'list_team' }
    m = t.match(/^(?:add|create)\s+(?:team\s+member|subcontractor|staff)\s+(.+?)(?:\s+(?:as|role)\s+(.+?))?(?:\s+(?:rate|payout)\s+([₹$]?[0-9,]+(?:\.[0-9]+)?))?$/)
    if (m) return {
        kind: 'add_team_member',
        name: stripPlaceholderBrackets(m[1]!),
        role: m[2] ? stripPlaceholderBrackets(m[2]) : undefined,
        payoutRate: parseAmount(m[3]),
    }

    if (/^(?:show|list|open)\s+payouts?\b/.test(t)) return { kind: 'list_payouts', status: /\bpaid\b/.test(t) ? 'paid' : /\bowed|pending\b/.test(t) ? 'owed' : undefined }
    m = t.match(/^(?:add|create)\s+payout\s+(.+?)\s+([₹$]?[0-9,]+(?:\.[0-9]+)?)(?:\s+(?:for|notes?)\s+(.+))?$/)
    if (m) return {
        kind: 'add_payout',
        memberName: stripPlaceholderBrackets(m[1]!),
        amount: parseAmount(m[2]!) ?? 0,
        notes: m[3] ? stripPlaceholderBrackets(m[3]) : undefined,
    }

    if (/^(?:show|list|open)\s+(?:assignments|work assignments)\b/.test(t)) return { kind: 'list_assignments' }
    m = t.match(/^(?:assign)\s+(.+?)\s+(?:task\s+)?to\s+(.+)$/)
    if (m) return { kind: 'assign_work', taskTitle: cleanTaskTitle(m[1]!), memberName: stripPlaceholderBrackets(m[2]!) }

    if (/^(?:show|list|open)\s+(?:invoice\s+)?templates\b/.test(t)) return { kind: 'list_invoice_templates' }
    m = t.match(/^(?:create|add)\s+(?:invoice\s+)?template\s+(.+)$/)
    if (m) return { kind: 'create_invoice_template', name: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:set|update|change)\s+(?:invoice\s+)?template\s+(.+?)\s+(?:email\s+)?subject\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_invoice_template', name: stripPlaceholderBrackets(m[1]!), updates: { subject: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:set|update|change)\s+(?:invoice\s+)?template\s+(.+?)\s+(?:email\s+)?message\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_invoice_template', name: stripPlaceholderBrackets(m[1]!), updates: { message: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:set|update|change)\s+(?:invoice\s+)?template\s+(.+?)\s+(?:payment\s+)?terms\s+(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_invoice_template', name: stripPlaceholderBrackets(m[1]!), updates: { terms: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:set|update|change)\s+(?:invoice\s+)?template\s+(.+?)\s+(?:accent|color|colour)\s+(?:to\s+)?(#[0-9a-f]{3,8}|[a-z]+)$/)
    if (m) return { kind: 'update_invoice_template', name: stripPlaceholderBrackets(m[1]!), updates: { accentColor: stripPlaceholderBrackets(m[2]!) } }

    m = t.match(/^(?:make|set)\s+(?:invoice\s+)?template\s+(.+?)\s+(?:as\s+)?default$/)
    if (m) return { kind: 'update_invoice_template', name: stripPlaceholderBrackets(m[1]!), updates: { isDefault: true } }

    if (/^(?:show|list|open)\s+(?:documents|contracts|legal notices)\b/.test(t)) {
        return {
            kind: 'list_documents',
            documentType: /\blegal notices?\b/.test(t) ? 'legal_notice' : /\bcontracts?\b/.test(t) ? 'contract' : undefined,
        }
    }
    m = t.match(/^(?:draft|create|generate|build)\s+contract(?:\s+(?:for|with)\s+(.+?))?(?:\s+(?:for project|project)\s+(.+))?$/)
    if (m) return { kind: 'draft_contract', clientName: m[1] ? stripPlaceholderBrackets(m[1]) : undefined, projectName: m[2] ? stripPlaceholderBrackets(m[2]) : undefined }

    m = t.match(/^(?:draft|create|generate|build)\s+(?:legal\s+notice|non[-\s]?payment\s+notice)(?:\s+(?:for|to)\s+(.+?))?(?:\s+(?:invoice\s+)?#?([a-z0-9-]+))?$/)
    if (m) return { kind: 'draft_legal_notice', clientName: m[1] ? stripPlaceholderBrackets(m[1]) : undefined, invoiceNumber: m[2] ? stripPlaceholderBrackets(m[2]) : undefined }

    m = t.match(/^(?:send|email|mail)\s+(contract|agreement|legal\s+notice|non[-\s]?payment\s+notice)(?:\s+(?:for|to)\s+(.+))?$/)
    if (m) {
        const type = /legal|notice|non/.test(m[1]!) ? 'legal_notice' : 'contract'
        return { kind: 'send_document', documentType: type, clientName: m[2] ? stripPlaceholderBrackets(m[2]) : undefined }
    }

    m = t.match(/^(?:send|email|mail)\s+document\s+(.+)$/)
    if (m) return { kind: 'send_document', title: stripPlaceholderBrackets(m[1]!) }

    if (/^(?:show|list|open)\s+payment\s+links?\b/.test(t)) return { kind: 'list_payment_links' }
    m = t.match(/^(?:create|generate|make)\s+payment\s+link(?:\s+(?:for\s+)?invoice\s+#?([a-z0-9-]+))?(?:\s+(?:for|to)\s+(.+))?$/)
    if (m) return { kind: 'create_payment_link', invoiceNumber: m[1] ? stripPlaceholderBrackets(m[1]) : undefined, clientName: m[2] ? stripPlaceholderBrackets(m[2]) : undefined }

    // ── Task view: "show all tasks in X" (tolerate sho/shwo/view typos) ──
    m = t.match(/^(?:show|sho|shwo|view)\s+all\s+tasks?\s+(?:in|for)\s+(.+)$/)
    if (m) return { kind: 'show_tasks', projectName: stripPlaceholderBrackets(m[1]!) }

    if (/^(?:show|sho|shwo)\s+all\s+tasks?\s*$|^(?:show|sho|shwo)\s+everything\b/.test(t)) return { kind: 'show_tasks', all: true }

    if (/^(?:show|sho|shwo)\s+all\s*$/.test(t)) return { kind: 'show_tasks', all: true }

    // "tasks in X" / "task for X" — same intent as "show tasks in X"
    m = t.match(/^tasks?\s+(?:in|for)\s+(.+)$/)
    if (m) return { kind: 'show_tasks', projectName: stripPlaceholderBrackets(m[1]!) }

    // "show/sho/list/see/open … tasks in X"
    m = t.match(/^(?:show|sho|shwo|see|list|open|view)\s+tasks?\s+(?:in|for)\s+(.+)$/)
    if (m) return { kind: 'show_tasks', projectName: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^what(?:'s|s|\s+is)?\s+tasks?\s+(?:in|for)\s+(.+)$/)
    if (m) return { kind: 'show_tasks', projectName: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^open\s+tasks?\s+(?:for|in)\s+(.+)$/)
    if (m) return { kind: 'show_tasks', projectName: stripPlaceholderBrackets(m[1]!) }

    if (/^(?:show|sho|shwo)\s+overdue\s+tasks?\b/.test(t)) return { kind: 'filter_tasks_status', status: 'overdue' }

    m = t.match(/^(?:show|sho|shwo)\s+(completed|done|pending|todo|in progress|blocked|overdue)\s+tasks?\b/)
    if (m) return { kind: 'filter_tasks_status', status: mapTaskStatus(m[1]!) }

    m = t.match(/^(?:show|sho|shwo)\s+tasks?\s+due\s+(today|tomorrow|this week)\b/)
    if (m) return { kind: 'filter_tasks_status', status: `due:${m[1]!}` }

    m = t.match(/^(?:show|list|view)\s+clients\s+(?:in|from)\s+(.+)$/)
    if (m) return { kind: 'list_clients', city: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:show|list|view)\s+(active|inactive)\s+clients\b/)
    if (m) return { kind: 'list_clients', status: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:show|list|view|find)\s+client\s+(.+)$/)
    if (m) return { kind: 'list_clients', search: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:show|list|view)\s+(?:all\s+)?clients\b/)
    if (m) return { kind: 'list_clients' }

    m = t.match(/^(?:show|list|view)\s+(?:all\s+)?invoices\b/)
    if (m) return { kind: 'list_invoices' }

    m = t.match(/^(?:show|view|open)\s+invoice\s+#?([A-Za-z0-9-]+)$/)
    if (m) return { kind: 'show_invoice', invoiceNumber: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:show|view|open)\s+invoice\s+(?:for|to)\s+(.+)$/)
    if (m) return { kind: 'show_invoice', clientName: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:mark|set)\s+invoice\s+#?([A-Za-z0-9-]+)\s+as\s+(paid|sent|draft|overdue)$/)
    if (m) return { kind: 'mark_invoice_status', invoiceNumber: stripPlaceholderBrackets(m[1]!), status: m[2]! }

    m = t.match(/^(?:mark|set)\s+invoice\s+(?:for|to)\s+(.+?)\s+as\s+(paid|sent|draft|overdue)$/)
    if (m) return { kind: 'mark_invoice_status', clientName: stripPlaceholderBrackets(m[1]!), status: m[2]! }

    m = t.match(/^(?:create|generate|make)\s+invoice\s+(?:for\s+)?(.+?)(?:\s+(?:for\s+)?([0-9,]+(?:\.[0-9]+)?))?$/)
    if (m) {
        const clientName = stripPlaceholderBrackets(m[1]!)
        const amount = m[2] ? Number(m[2].replace(/,/g, '')) : undefined
        return { kind: 'create_invoice', clientName, amount }
    }

    m = t.match(/^(?:send|email|mail)\s+invoice\s+#?([A-Za-z0-9-]+)(?:\s+to\s+(.+))?$/)
    if (m) {
        const invoiceNumber = stripPlaceholderBrackets(m[1]!)
        const clientName = m[2] ? stripPlaceholderBrackets(m[2]!) : undefined
        return { kind: 'email_invoice', invoiceNumber, clientName }
    }

    m = t.match(/^(?:send|email|mail)\s+invoice\s+to\s+(.+)$/)
    if (m) {
        return { kind: 'email_invoice', clientName: stripPlaceholderBrackets(m[1]!) }
    }

    m = t.match(/^(?:remind|send reminder|nudge)\s+(.+?)(?:\s+about\s+.*)?$/)
    if (m) return { kind: 'send_reminder', clientName: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^(?:add|create)\s+task\s+(.+?)(?:\s+to\s+(.+))?$/)
    if (m) {
        const title = stripPlaceholderBrackets(m[1]!.trim())
        const projectName = m[2] ? stripPlaceholderBrackets(m[2].trim()) : undefined
        if (!title) return null
        return { kind: 'add_task', title, projectName }
    }

    // Start / stop timer via chat
    m = t.match(/^(?:start|begin|resume)\s+(?:a\s+)?timer(?:\s+for\s+(.+))?$/)
    if (m) {
        const task = m[1] ? stripPlaceholderBrackets(m[1]!) : undefined
        return { kind: 'start_timer', task }
    }

    if (/^(?:stop|end|pause)\s+(?:the\s+)?timer\b/.test(t)) return { kind: 'stop_timer' }

    m = t.match(/^mark\s+all(?:\s+tasks?)?\s+in\s+(.+?)\s+as\s+(.+)$/)
    if (m)
        return {
            kind: 'mark_all_tasks',
            projectName: stripPlaceholderBrackets(m[1]!),
            status: mapTaskStatus(m[2]!),
        }

    if (/^mark\s+all(?:\s+tasks?)?\s+as\s+/.test(t)) {
        const m2 = t.match(/^mark\s+all(?:\s+tasks?)?\s+as\s+(.+)$/)
        if (m2) return { kind: 'mark_all_tasks', status: mapTaskStatus(m2[1]!) }
    }

    m = t.match(/^(?:delete|remove)\s+task\s+(.+)$/)
    if (m) return { kind: 'delete_task', title: cleanTaskTitle(m[1]!) }

    m = t.match(/^(?:rename|change|update)\s+task\s+(.+?)\s+(?:to|title\s+to)\s+(.+)$/)
    if (m) return { kind: 'update_task', title: cleanTaskTitle(m[1]!), updates: { title: cleanTaskTitle(m[2]!) } }

    m = t.match(/^(?:set|update|change)\s+task\s+(.+?)\s+(?:estimate|estimated hours|hours)\s+(?:to\s+)?([0-9]+(?:\.[0-9]+)?)$/)
    if (m) return { kind: 'update_task', title: cleanTaskTitle(m[1]!), updates: { estimatedHours: Number(m[2]) } }

    m = t.match(/^(?:set|update|change)\s+task\s+(.+?)\s+due\s+(?:date\s+)?(?:to\s+)?(.+)$/)
    if (m) return { kind: 'update_task', title: cleanTaskTitle(m[1]!), updates: { dueDate: cleanDateValue(m[2]) } }

    m = t.match(/^(?:delete|remove)\s+(.+?)\s+(?:task|todo|to-do|item)$/)
    if (m) return { kind: 'delete_task', title: cleanTaskTitle(m[1]!) }

    m = t.match(/^(?:complete|finish|close|wrap up|done with)\s+(?:task\s+)?(.+)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: 'done' }

    m = t.match(/^(.+?)\s+(?:task|todo|to-do|item)\s+(?:is\s+)?(?:done|completed|complete|finished|closed)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: 'done' }

    m = t.match(/^(.+?)\s+(?:is\s+)?(?:done|completed|complete|finished|closed)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: 'done' }

    m = t.match(/^(?:reopen|restart)\s+(?:task\s+)?(.+)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: 'todo' }

    m = t.match(/^(?:move|shift|put|set)\s+(?:task\s+)?(.+?)\s+(?:task\s+)?(?:to|as|in|into)\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^mark\s+(?:task\s+)?(.+?)\s+(?:task\s+)?as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: cleanTaskTitle(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^(?:mark|set)\s+it\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: '__last__', status: mapTaskStatus(m[1]!) }

    m = t.match(/^(?:complete|finish|close)\s+(?:task\s+)?(.+)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: 'done' }

    m = t.match(/^(.+?)\s+task\s+(?:is\s+)?(?:done|completed|complete|finished|closed)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: 'done' }

    m = t.match(/^(?:reopen|restart)\s+(?:task\s+)?(.+)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: 'todo' }

    m = t.match(/^(?:move|shift|put|set)\s+(?:task\s+)?(.+?)\s+(?:to|as|in|into)\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^mark\s+(?:task\s+)?(.+?)\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^(?:mark|set)\s+it\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: '__last__', status: mapTaskStatus(m[1]!) }

    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^(?:mark|set)\s+it\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: '__last__', status: mapTaskStatus(m[1]!) }

    // Clear filters — must NOT include "show all tasks" (handled above)
    if (/^(clear filters|reset view)\b/.test(t)) return { kind: 'clear_filters' }

    return null
}
