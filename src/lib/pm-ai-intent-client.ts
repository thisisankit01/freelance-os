import type { ParsedPmCommand } from '@/lib/pm-command-parser'

type EntityRows = {
    projects: { id: string; title: string }[]
    tasks?: { id: string; title: string }[]
    clients: { id: string; name: string }[]
}

type ClarificationResult = {
    type: 'clarify'
    reply: string
    chips?: { label: string; payload: string }[]
}

type CommandResult = {
    type: 'command'
    command: ParsedPmCommand
}

type NoneResult = {
    type: 'none'
}

export type AiPmParseResult = CommandResult | ClarificationResult | NoneResult

type AiIntentResponse =
    | (ParsedPmCommand & { confidence?: number })
    | {
    kind: 'ask_clarification'
    confidence?: number
    reply?: string
    chips?: { label: string; payload: string }[]
}
    | {
    kind: 'none'
    confidence?: number
    reason?: string
}

function minimumConfidenceForCommand(command: ParsedPmCommand) {
    switch (command.kind) {
        case 'delete_project':
        case 'delete_task':
        case 'email_invoice':
        case 'send_reminder':
        case 'mark_invoice_status':
        case 'send_document':
        case 'delete_client':
            return 0.82
        case 'create_project':
        case 'open_project_editor':
        case 'update_project':
        case 'rename_project':
        case 'set_project_status':
        case 'add_task':
        case 'update_task':
        case 'mark_task':
        case 'create_invoice':
        case 'start_timer':
        case 'stop_timer':
        case 'update_invoice_template':
        case 'create_client':
        case 'update_client':
            return 0.72
        case 'open_client_import':
            return 0.58
        default:
            return 0.62
    }
}

export async function parsePmCommandWithAi(
    prompt: string,
    entities: EntityRows,
): Promise<AiPmParseResult> {
    const res = await fetch('/api/pm-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prompt,
            projects: entities.projects.map((p) => p.title),
            tasks: (entities.tasks ?? []).map((t) => t.title),
            clients: entities.clients.map((c) => c.name),
        }),
    })

    if (!res.ok) return { type: 'none' }

    const json = (await res.json().catch(() => null)) as AiIntentResponse | null
    if (!json || json.kind === 'none') return { type: 'none' }

    const confidence = typeof json.confidence === 'number' ? json.confidence : 0

    if (json.kind === 'ask_clarification') {
        if (confidence < 0.45) return { type: 'none' }

        return {
            type: 'clarify',
            reply:
                typeof json.reply === 'string' && json.reply.trim()
                    ? json.reply.trim()
                    : 'I need one more detail before I do that.',
            chips: Array.isArray(json.chips)
                ? json.chips
                    .filter((c) => c.label && c.payload)
                    .map((c) => ({ label: c.label, payload: c.payload }))
                    .slice(0, 6)
                : undefined,
        }
    }

    const { confidence: _confidence, ...command } = json as ParsedPmCommand & {
        confidence?: number
    }
    void _confidence

    if (confidence < minimumConfidenceForCommand(command as ParsedPmCommand)) {
        return { type: 'none' }
    }

    return {
        type: 'command',
        command: command as ParsedPmCommand,
    }
}
