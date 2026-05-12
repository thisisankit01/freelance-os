/**
 * Client-side PM command parser — returns structured intent or null (fallback to Aria).
 */

export type ParsedPmCommand =
    | { kind: 'help' }
    | { kind: 'clear_filters' }
    | { kind: 'list_projects' }
    | { kind: 'current_context' }
    | { kind: 'confirm_yes' }
    | { kind: 'confirm_no' }
    | { kind: 'undo' }
    | { kind: 'summary' }
    | { kind: 'create_project'; name: string }
    | { kind: 'rename_project'; from: string; to: string }
    | { kind: 'delete_project'; name: string }
    | { kind: 'show_tasks'; projectName?: string; all?: boolean }
    | { kind: 'filter_tasks_status'; status: string }
    | { kind: 'add_task'; title: string; projectName?: string }
    | { kind: 'mark_task'; title: string; status: string }
    | { kind: 'mark_task_by_id'; taskId: string; status: string }
    | { kind: 'delete_task'; title: string }
    | { kind: 'delete_task_by_id'; taskId: string }
    | { kind: 'mark_all_tasks'; projectName?: string; status: string }

function norm(s: string) {
    return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Strip wrapping [brackets] from UI placeholders like "[project]" */
export function stripPlaceholderBrackets(s: string) {
    const t = s.trim()
    if (t.startsWith('[') && t.endsWith(']')) return t.slice(1, -1).trim()
    return t
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

export function parsePmCommand(input: string): ParsedPmCommand | null {
    const raw = input.trim()
    const t = norm(input)
    if (!t) return null

    // Chip payloads (internal)
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
    if (/^list (all )?projects\b|^show (my )?projects\b/.test(t)) return { kind: 'list_projects' }

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

    m = t.match(/^rename\s+project\s+(.+?)\s+to\s+(.+)$/)
    if (m) return { kind: 'rename_project', from: stripPlaceholderBrackets(m[1]!), to: stripPlaceholderBrackets(m[2]!) }

    m = t.match(/^(?:delete|remove)\s+project\s+(.+)$/)
    if (m) return { kind: 'delete_project', name: stripPlaceholderBrackets(m[1]!) }

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

    m = t.match(/^(?:add|create)\s+task\s+(.+?)(?:\s+to\s+(.+))?$/)
    if (m) {
        const title = stripPlaceholderBrackets(m[1]!.trim())
        const projectName = m[2] ? stripPlaceholderBrackets(m[2].trim()) : undefined
        if (!title) return null
        return { kind: 'add_task', title, projectName }
    }

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
    if (m) return { kind: 'delete_task', title: stripPlaceholderBrackets(m[1]!) }

    m = t.match(/^mark\s+(?:task\s+)?(.+?)\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: stripPlaceholderBrackets(m[1]!), status: mapTaskStatus(m[2]!) }

    m = t.match(/^(?:mark|set)\s+it\s+as\s+(.+)$/)
    if (m) return { kind: 'mark_task', title: '__last__', status: mapTaskStatus(m[1]!) }

    // Clear filters — must NOT include "show all tasks" (handled above)
    if (/^(clear filters|reset view)\b/.test(t)) return { kind: 'clear_filters' }

    return null
}
