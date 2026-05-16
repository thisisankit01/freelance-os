export type GuardedIntentResult =
    | {
    blocked: true
    reply: string
    chips?: { label: string; payload: string }[]
}
    | {
    blocked: false
}

export type ClarifyIntentResult = {
    shouldAsk: true
    reply: string
    chips?: { label: string; payload: string }[]
} | {
    shouldAsk: false
}

export type SeriousIntentResult = {
    serious: boolean
    reply: string
    chips?: { label: string; payload: string }[]
}

function hasAny(text: string, patterns: RegExp[]) {
    return patterns.some((p) => p.test(text))
}

function normalized(input: string) {
    return input.trim().toLowerCase().replace(/^\[today:[^\]]+\]\s*/i, '').replace(/\s+/g, ' ')
}

export function guardUnsafeOrUnsupportedIntent(input: string): GuardedIntentResult {
    const t = normalized(input)
    if (!t) return { blocked: false }

    const legalNoticeIntent = hasAny(t, [
        /\blegal\s+notice\b/,
        /\bnotice\s+for\s+non[-\s]?payment\b/,
        /\bnon[-\s]?payment\s+notice\b/,
        /\blegal\s+warning\b/,
        /\bdemand\s+notice\b/,
        /\bpayment\s+default\s+notice\b/,
        /\bsue\b/,
        /\blawyer\b/,
        /\badvocate\b/,
    ])

    if (legalNoticeIntent) {
        if (/^(draft|create|generate|build)\b/.test(t) && !/\b(send|email|mail|share|deliver)\b/.test(t)) {
            return { blocked: false }
        }
        return {
            blocked: true,
            reply:
                "I can help draft a legal notice, but I won’t send it without a proper draft and confirmation. Who is it for, and which unpaid invoice should it refer to?",
            chips: [
                {
                    label: "Draft legal notice",
                    payload: "draft legal notice for Rahul for unpaid invoice",
                },
                {
                    label: "Show unpaid invoices",
                    payload: "show overdue invoices",
                },
            ],
        }
    }

    const contractIntent = hasAny(t, [
        /\bcontract\b/,
        /\bagreement\b/,
        /\bwork\s+order\b/,
        /\bservice\s+agreement\b/,
        /\bstatement\s+of\s+work\b/,
        /\bsow\b/,
        /\bnda\b/,
    ])

    if (contractIntent) {
        if (/^(draft|create|generate|build)\b/.test(t) && !/\b(send|email|mail|share|deliver)\b/.test(t)) {
            return { blocked: false }
        }
        return {
            blocked: true,
            reply:
                "I can help create a contract draft, but I need the client, project scope, amount, deadline, and payment terms first.",
            chips: [
                {
                    label: "Start contract draft",
                    payload: "draft contract for client",
                },
                {
                    label: "Show clients",
                    payload: "show clients",
                },
            ],
        }
    }

    const whatsappIntent = hasAny(t, [
        /\bwhatsapp\b/,
        /\bwa\b/,
        /\bmessage\s+on\s+whatsapp\b/,
        /\bsend\s+.*\s+whatsapp\b/,
    ])

    if (whatsappIntent) {
        return {
            blocked: true,
            reply:
                "WhatsApp sending needs a connected WhatsApp Business provider first. For now, I can prepare the message draft.",
            chips: [
                {
                    label: "Draft WhatsApp message",
                    payload: "draft message for client",
                },
                {
                    label: "Show clients",
                    payload: "show clients",
                },
            ],
        }
    }

    const paymentLinkIntent = hasAny(t, [
        /\bpayment\s+link\b/,
        /\brazorpay\b/,
        /\bupi\s+link\b/,
        /\bcollect\s+payment\b/,
        /\bpay\s+link\b/,
        /\bcheckout\s+link\b/,
    ])

    if (paymentLinkIntent) {
        if (/^(create|generate|make|show|list|open)\b/.test(t) && !/\b(send|share|collect|charge)\b/.test(t)) {
            return { blocked: false }
        }
        return {
            blocked: true,
            reply:
                "Payment links are not fully connected yet. I can show invoices or help prepare the payment request first.",
            chips: [
                {
                    label: "Show invoices",
                    payload: "show invoices",
                },
                {
                    label: "Show overdue invoices",
                    payload: "show overdue invoices",
                },
            ],
        }
    }

    const vagueDangerousSend = hasAny(t, [
        /^send it$/,
        /^send this$/,
        /^mail it$/,
        /^email it$/,
        /^share it$/,
        /^delete it$/,
        /^remove it$/,
    ])

    if (vagueDangerousSend) {
        return {
            blocked: true,
            reply: "What exactly should I act on? I need the item and recipient before doing that.",
        }
    }

    return { blocked: false }
}

export function isSensitiveWorkspaceAction(input: string): SeriousIntentResult {
    const t = normalized(input)
    if (!t) return { serious: false, reply: '' }

    const safeDraftOrSetup = hasAny(t, [
        /^(draft|create|generate|build)\s+(?:a\s+)?(?:contract|legal\s+notice|non[-\s]?payment\s+notice)\b/,
        /^(create|generate|make|show|list|open)\s+(?:a\s+)?payment\s+links?\b/,
    ])
    if (safeDraftOrSetup && !/\b(send|email|mail|share|deliver|collect|charge)\b/.test(t)) {
        return { serious: false, reply: '' }
    }

    const unsupported = guardUnsafeOrUnsupportedIntent(t)
    if (unsupported.blocked) {
        return {
            serious: true,
            reply: unsupported.reply,
            chips: unsupported.chips,
        }
    }

    const destructiveOrSend = hasAny(t, [
        /\b(delete|remove|cancel|wipe|clear|drop)\b/,
        /\b(send|email|mail|share|deliver|remind|nudge)\b/,
        /\b(payment|pay|checkout|collect|charge|refund)\b/,
    ])

    if (destructiveOrSend) {
        return {
            serious: true,
            reply:
                'I need the exact target before I do that. Please mention the item, recipient/client, and any date or amount.',
            chips: [
                { label: 'Show invoices', payload: 'show invoices' },
                { label: 'Show clients', payload: 'show clients' },
                { label: 'Show calendar', payload: 'show calendar' },
            ],
        }
    }

    const mutation = hasAny(t, [
        /\b(create|add|new|make|generate|rename|move|set|mark|finish|complete|close|pause|resume|start|stop|track|schedule|book|update|change)\b/,
    ])
    const object = hasAny(t, [
        /\b(projects?|tasks?|todos?|clients?|invoices?|bills?|payments?|appointments?|meetings?|calendar|timer|contracts?|agreements?)\b/,
    ])

    if (mutation && object) {
        return {
            serious: true,
            reply:
                'I’m not certain enough to change that. Please include the exact project, task, client, invoice, date, or amount.',
            chips: [
                { label: 'Show projects', payload: 'show projects' },
                { label: 'Show invoices', payload: 'show invoices' },
                { label: 'Show clients', payload: 'show clients' },
            ],
        }
    }

    return { serious: false, reply: '' }
}

export function shouldAskInsteadOfUiFallback(input: string): ClarifyIntentResult {
    const t = normalized(input)
    if (!t) return { shouldAsk: false }

    const serious = isSensitiveWorkspaceAction(t)
    if (serious.serious) {
        return {
            shouldAsk: true,
            reply: serious.reply,
            chips: serious.chips,
        }
    }

    const safeSmallTalk = hasAny(t, [
        /\b(hi|hello|hey|morning|evening|night|thanks?|thank you)\b/,
        /\b(help|what can you do|capabilities|how does this work)\b/,
    ])
    if (safeSmallTalk) return { shouldAsk: false }

    const businessOrWorkspaceIntent = hasAny(t, [
        /\b(projects?|tasks?|todos?|kanban|board|timer|track time|profitability)\b/,
        /\b(clients?|invoices?|bill|billing|payments?|paid|unpaid|overdue|revenue|earnings?)\b/,
        /\b(meetings?|appointments?|calendar|schedule|book|cancel|remind|reminder|call)\b/,
        /\b(create|add|new|rename|delete|remove|send|email|mail|share|mark|move|finish|complete|close|pause|resume)\b/,
    ])

    if (!businessOrWorkspaceIntent) return { shouldAsk: false }

    const vagueReference = hasAny(t, [
        /\b(it|this|that|thing|stuff|something|someone|them)\b/,
        /\byou\s+know\b/,
    ])
    const actionWithoutKnownShape = hasAny(t, [
        /\b(create|add|new|rename|delete|remove|send|email|mail|share|mark|move|finish|complete|close|pause|resume|update|change)\b/,
    ])

    if (!vagueReference && !actionWithoutKnownShape) return { shouldAsk: false }

    return {
        shouldAsk: true,
        reply:
            "I’m not certain what to change. Please be specific, for example: show tasks in Acme, create invoice for Rahul 5000, or schedule call with Priya tomorrow.",
        chips: [
            { label: "Show projects", payload: "show projects" },
            { label: "Show invoices", payload: "show invoices" },
            { label: "Show clients", payload: "show clients" },
        ],
    }
}
