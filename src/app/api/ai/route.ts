// src/app/api/ai/route.ts
//
// Uses OpenRouter (Gemini Flash) via Vercel AI SDK.
// The AI interprets user intent and returns structured JSON.
// We sanitise on the way out — nothing crashes, everything gets a response.

import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
})

// All components that exist in the registry
const VALID_COMPONENTS = [
    'StatsBar',
    'ClientTable',
    'ClientCard',
    'InvoiceList',
    'InvoiceBuilder',
    'PaymentStatus',
    'EmptyState',
] as const

type Component = typeof VALID_COMPONENTS[number]

export type AriaResponse = {
    reply: string          // conversational reply shown to user — always present
    changeUI: boolean      // should the dashboard change?
    components?: Component[]
    filters?: {
        status?: string
        city?: string
        search?: string
    }
    action?: string
    emptyMessage?: string
}

// Sanitise whatever the AI returns into something safe
function sanitise(raw: Record<string, unknown>): AriaResponse {
    const reply = typeof raw.reply === 'string' && raw.reply.trim()
        ? raw.reply.trim()
        : "I'm here to help with your freelance business!"

    const changeUI = raw.changeUI === true

    if (!changeUI) {
        return { reply, changeUI: false }
    }

    // Filter components — only keep ones that actually exist in our registry
    const rawComponents = Array.isArray(raw.components) ? raw.components : []
    const components = rawComponents.filter(
        (c): c is Component => typeof c === 'string' && VALID_COMPONENTS.includes(c as Component)
    )

    // If AI returned garbage components, fall back to dashboard
    const safeComponents: Component[] = components.length > 0
        ? components
        : ['StatsBar', 'ClientTable']

    // Filters — accept any string values, they go into Supabase .ilike() which is safe
    const rawFilters = typeof raw.filters === 'object' && raw.filters !== null
        ? raw.filters as Record<string, unknown>
        : {}

    const filters: AriaResponse['filters'] = {}
    if (typeof rawFilters.status === 'string') filters.status = rawFilters.status
    if (typeof rawFilters.city === 'string') filters.city = rawFilters.city
    if (typeof rawFilters.search === 'string') filters.search = rawFilters.search

    // Auto-generate emptyMessage from filters if AI didn't provide one
    let emptyMessage = typeof raw.emptyMessage === 'string' ? raw.emptyMessage : undefined
    if (!emptyMessage) {
        if (filters.search) emptyMessage = `No client named "${filters.search}" found`
        else if (filters.city) emptyMessage = `No clients in ${filters.city}`
        else if (filters.status) emptyMessage = `No ${filters.status} results found`
    }

    return {
        reply,
        changeUI: true,
        components: safeComponents,
        filters,
        action: typeof raw.action === 'string' ? raw.action : 'none',
        emptyMessage,
    }
}

const SYSTEM_PROMPT = `You are Aria — a warm, clever AI assistant built into FreelanceOS, a tool that helps freelancers manage clients, invoices, and payments.

YOU RESPOND TO EVERYTHING. No request is ignored. You are never rude, never cold, never robotic.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
WHAT YOU CAN SHOW (the dashboard components):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- StatsBar        → earnings summary: total earned, pending, overdue
- ClientTable     → list of clients (filter by city, status, name)
- ClientCard      → single client's full profile and history  
- InvoiceList     → list of invoices (filter by status: paid/overdue/draft/sent)
- InvoiceBuilder  → form to create a brand new invoice
- PaymentStatus   → payment summary and breakdown
- EmptyState      → shown when nothing relevant exists

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO HANDLE DIFFERENT MESSAGES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GREETINGS ("hi", "hello", "hey", "good morning", "what's up"):
→ changeUI: false. Reply warmly, introduce yourself briefly.

GRATITUDE ("thanks", "great", "awesome", "perfect"):
→ changeUI: false. Reply warmly.

HELP / CAPABILITIES ("what can you do", "help me", "how does this work"):
→ changeUI: false. Explain what you can do in 2-3 sentences, conversationally.

BUSINESS REQUESTS (anything about clients, invoices, payments, earnings):
→ changeUI: true. Pick the right components. Understand ALL natural variations:
  • "non active" / "not active" / "old clients" / "former" / "past" = inactive status
  • "current" / "ongoing" / "working with" = active status  
  • "who owes" / "hasn't paid" / "late" / "due" / "pending" / "unpaid" = overdue
  • "settled" / "received" / "cleared" / "done" = paid
  • "make bill" / "generate invoice" / "new invoice" / "charge someone" = InvoiceBuilder
  • "show invoices" / "my bills" / "list invoices" = InvoiceList
  • "how much did I make" / "my money" / "revenue" / "income" = StatsBar
  • ANY city/location anywhere in the world = ClientTable with { "city": "<that city>" } filter
  • ANY person name mentioned = ClientTable with { "search": "<that name>" } filter — ALWAYS put the name in search filter, never leave filters empty when a name is given
    Example: "client named Ankit" → { "components": ["ClientTable"], "filters": { "search": "Ankit" }, "emptyMessage": "No client named Ankit found" }

EMOTIONAL / STRESSED ("I'm overwhelmed", "so many unpaid invoices", "I'm behind"):
→ changeUI: true. Empathise in reply, then show the most helpful component.

OUT OF DOMAIN ("what's the weather", "write me a poem", "who won the match"):
→ changeUI: false. Reply warmly, acknowledge it's outside your area, offer to help with their freelance work instead. Be friendly not robotic.

UNCLEAR / VAGUE ("show me stuff", "the thing", "you know what I mean"):
→ changeUI: true. Make your best guess. Show StatsBar + ClientTable. Mention what you showed.

COMPLAINTS ("this is useless", "you don't understand"):
→ changeUI: false. Apologise sincerely, ask them to rephrase, offer examples.

FOLLOWUP QUESTIONS (uses context from history like "now show only the paid ones"):
→ changeUI: true. Use history to understand what they're referring to.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT (always valid JSON):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{
  "reply": "Your conversational reply here — warm, human, under 15 words",
  "changeUI": true or false,
  "components": ["StatsBar", "ClientTable"],   // only when changeUI is true
  "filters": { "city": "Mumbai" },             // only when changeUI is true, only if filtering
  "action": "none",                            // only when changeUI is true
  "emptyMessage": "No clients in Mumbai yet"   // ALWAYS include when filters are set — describes what to show if 0 results
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TONE RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Warm, helpful, occasionally use a relevant emoji (not excessive)
- Never say "I cannot", "I don't support", "invalid request"
- Never be robotic or formal
- Always try. If unsure, make a smart guess and mention it.
- Short replies — this is a command bar, not a chat essay

Return ONLY valid JSON. Nothing outside the JSON object.`

// Helper: generic fallback response
function genericFallback(): AriaResponse {
    return {
        reply: "I'm here to help with your freelance business. Ask me about clients, invoices, payments, or anything related!",
        changeUI: false,
    }
}

export async function POST(req: Request) {
    const { prompt, context, history = [] } = await req.json()

    if (!prompt?.trim()) {
        return Response.json({
            reply: 'Hey! What would you like to do today?',
            changeUI: false,
        } satisfies AriaResponse)
    }

    try {
        // Build messages array with conversation history
        const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [
            { role: 'system', content: SYSTEM_PROMPT },
            // Conversation history gives Aria memory
            ...history.slice(-8).map((h: { role: string; content: string }) => ({
                role: h.role as 'user' | 'assistant',
                content: h.content,
            })),
            {
                role: 'user',
                content: prompt,
            },
        ]

        const result = await generateText({
            model: openrouter('google/gemini-2.0-flash-001'),
            messages,
            temperature: 0.2,
            maxOutputTokens: 300,
        })

        const raw = result.text
        if (!raw) throw new Error('Empty response from AI')

        // Strip any accidental markdown fences
        const clean = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

        // Try to extract JSON object if AI added extra text
        const jsonMatch = clean.match(/\{[\s\S]*\}/)
        if (!jsonMatch) throw new Error('No JSON object found in response')

        const parsed = JSON.parse(jsonMatch[0])

        // Sanitise — never crash, always return something valid
        const response = sanitise(parsed)

        console.log(`[Aria] "${prompt}" → "${response.reply}" (changeUI: ${response.changeUI})`)
        return Response.json(response)

    } catch (err: any) {
        console.error('[Aria] Error:', err?.message || err)

        // On AI failure, use simple heuristic fallback
        const p = prompt.toLowerCase()

        // Greeting detection
        if (/\b(hi|hello|hey|morning|evening|night|sup|yo|hola|greetings)\b/.test(p)) {
            return Response.json({
                reply: "Hey! 👋 I'm Aria, your freelance assistant. How can I help you today?",
                changeUI: false,
            } satisfies AriaResponse)
        }

        // Gratitude detection
        if (/\b(thanks?|thank you|great|awesome|perfect|cool|nice|fantastic|appreciate)\b/.test(p)) {
            return Response.json({
                reply: "Glad to help! Anything else you need?",
                changeUI: false,
            } satisfies AriaResponse)
        }

        // Help / capabilities detection
        if (/\b(help|what can|how do|capabilities|what do you do|assist)\b/.test(p)) {
            return Response.json({
                reply: "I can manage clients, invoices, payments, and give you quick stats — just ask!",
                changeUI: false,
            } satisfies AriaResponse)
        }

        // Business-related query — show default dashboard
        const businessPattern = /\b(client|clients|invoice|invoices|payment|payments|earn|revenue|money|due|overdue|paid|stats|city|active|inactive|bill|billing)\b/i
        if (businessPattern.test(prompt)) {
            // Try to pick the right components based on keywords
            const components: Component[] = []
            if (/\b(invoice|invoices|bill|billing)\b/i.test(prompt)) {
                if (/\b(create|new|make|generate)\b/i.test(prompt)) {
                    components.push('InvoiceBuilder')
                } else {
                    components.push('InvoiceList')
                }
            }
            if (/\b(client|clients)\b/i.test(prompt)) {
                components.push('ClientTable')
            }
            if (/\b(payment|payments)\b/i.test(prompt)) {
                components.push('PaymentStatus')
            }
            if (/\b(earn|revenue|money|stats)\b/i.test(prompt)) {
                components.push('StatsBar')
            }
            // Default if nothing specific matched
            if (components.length === 0) {
                components.push('StatsBar', 'ClientTable')
            }

            // Try to extract filters
            const filters: AriaResponse['filters'] = {}
            if (/\b(active)\b/i.test(prompt) && !/\b(inactive|non.?active|not.?active)\b/i.test(prompt)) {
                filters.status = 'active'
            } else if (/\b(inactive|non.?active|not.?active)\b/i.test(prompt)) {
                filters.status = 'inactive'
            }
            if (/\b(paid)\b/i.test(prompt)) {
                filters.status = 'paid'
            } else if (/\b(overdue|unpaid|due|pending)\b/i.test(prompt)) {
                filters.status = 'overdue'
            }

            return Response.json({
                reply: "Let me pull that up for you! 📊",
                changeUI: true,
                components,
                filters,
                action: 'none',
            } satisfies AriaResponse)
        }

        // For any other error, return a generic fallback without UI change
        return Response.json(genericFallback() satisfies AriaResponse)
    }
}