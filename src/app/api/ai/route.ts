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
    'BookingCalendar',
    'AppointmentCard',
    'SlotPicker',
    'ReminderSender',
    'ProjectBoard',
    'TaskBoard',
    'TimeTracker',
    'ProjectProfit'
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
        week?: string      // 'current' for "this week" queries
    }
    action?: string        // 'none' | 'create_appointment' | ... | 'edit_project'
    appointmentData?: {
        clientName?: string
        /** YYYY-MM-DD — create_appointment start date, OR cancel date_client bulk target day */
        date?: string
        time?: string
        title?: string
        notes?: string
        /** bulk cancel: 'month' | 'client' | 'month_client' | 'date_client' | 'all_future' */
        bulkScope?: string
        /** YYYY-MM, required for month / month_client */
        month?: string
        /** JSON array of { clientName?, date, time, title?, notes? } — set by sanitise from AI "meetings" */
        meetingsJson?: string
    }
    projectData?: {
        /** for edit_project: project id or title to fuzzy-match */
        id?: string
        title?: string
    }
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

    const actionStr = typeof raw.action === 'string' ? raw.action : 'none'
    /** BookingCalendar runs create/cancel/bulk side effects — it must mount or nothing happens */
    const APPOINTMENT_UI_ACTIONS = new Set([
        'create_appointment',
        'create_appointments_bulk',
        'cancel_appointment',
        'cancel_appointments_bulk',
    ])
    const componentsForUi: Component[] = APPOINTMENT_UI_ACTIONS.has(actionStr)
        ? ['BookingCalendar', ...safeComponents.filter((c) => c !== 'BookingCalendar')]
        : safeComponents

    // edit_project must always include ProjectBoard
    if (actionStr === 'edit_project') {
        if (!componentsForUi.includes('ProjectBoard')) componentsForUi.unshift('ProjectBoard')
    }

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

    const rawApptData = raw.appointmentData
    const appointmentData = typeof rawApptData === 'object' && rawApptData !== null
        ? (rawApptData as Record<string, unknown>)
        : undefined

    let meetingsJson: string | undefined
    if (appointmentData && Array.isArray(appointmentData.meetings)) {
        const slots = appointmentData.meetings
            .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null)
            .map((m) => ({
                clientName: typeof m.clientName === 'string' ? m.clientName : undefined,
                date: typeof m.date === 'string' ? m.date : '',
                time: typeof m.time === 'string' ? m.time : '',
                title: typeof m.title === 'string' ? m.title : undefined,
                notes: typeof m.notes === 'string' ? m.notes : undefined,
            }))
            .filter((s) => s.date && s.time)
        if (slots.length > 0) meetingsJson = JSON.stringify(slots)
    }

    const safeAppt: AriaResponse['appointmentData'] = appointmentData
        ? {
            ...(typeof appointmentData.clientName === 'string' ? { clientName: appointmentData.clientName } : {}),
            ...(typeof appointmentData.date === 'string' ? { date: appointmentData.date } : {}),
            ...(typeof appointmentData.time === 'string' ? { time: appointmentData.time } : {}),
            ...(typeof appointmentData.title === 'string' ? { title: appointmentData.title } : {}),
            ...(typeof appointmentData.notes === 'string' ? { notes: appointmentData.notes } : {}),
            ...(typeof appointmentData.bulkScope === 'string' ? { bulkScope: appointmentData.bulkScope } : {}),
            ...(typeof appointmentData.month === 'string' ? { month: appointmentData.month } : {}),
            ...(meetingsJson ? { meetingsJson } : {}),
        }
        : undefined

    // Project data for edit_project action
    const rawProjData = raw.projectData
    const projectData = typeof rawProjData === 'object' && rawProjData !== null
        ? (rawProjData as Record<string, unknown>)
        : undefined
    const safeProject: AriaResponse['projectData'] = projectData
        ? {
            ...(typeof projectData.id === 'string' ? { id: projectData.id } : {}),
            ...(typeof projectData.title === 'string' ? { title: projectData.title } : {}),
        }
        : undefined

    return {
        reply,
        changeUI: true,
        components: componentsForUi,
        filters,
        action: actionStr,
        appointmentData: safeAppt && Object.keys(safeAppt).length > 0 ? safeAppt : undefined,
        projectData: safeProject && Object.keys(safeProject).length > 0 ? safeProject : undefined,
        emptyMessage,
    }
}

/** Model sometimes picks month_client when the user asked for a single calendar day — fix before running the action. */
function reconcileBulkCancelDayVsMonth(userPrompt: string, response: AriaResponse): AriaResponse {
    if (response.action !== 'cancel_appointments_bulk' || !response.appointmentData) return response
    const ad = response.appointmentData
    if (ad.bulkScope !== 'month_client' || !ad.month || !ad.clientName) return response

    if (/\b(?:all|whole|entire)\s+month\b|\bthroughout\b|\beverything\s+in\b|\b(?:all|every)\s+meetings?\s+(?:with|for)\b.*\b(?:in|this)\s+month\b/i.test(userPrompt)) {
        return response
    }

    const dayMatch =
        userPrompt.match(/\b(?:on|for)\s+the\s+(\d{1,2})(?:st|nd|rd|th)?\b/i) ||
        userPrompt.match(/\b(?:on|for)\s+(\d{1,2})(?:st|nd|rd|th)\b/i)
    if (!dayMatch) return response

    const day = Math.min(31, Math.max(1, parseInt(dayMatch[1], 10)))
    const ym = ad.month.trim()
    const parts = ym.split('-').map(Number)
    const y = parts[0]
    const m = parts[1]
    if (!y || !m || m < 1 || m > 12) return response

    const test = new Date(Date.UTC(y, m - 1, day))
    if (test.getUTCFullYear() !== y || test.getUTCMonth() !== m - 1 || test.getUTCDate() !== day) {
        return response
    }

    const dateStr = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return {
        ...response,
        appointmentData: {
            ...ad,
            bulkScope: 'date_client',
            date: dateStr,
            month: undefined,
        },
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
- BookingCalendar → full month calendar showing all appointments (create/cancel)
- AppointmentCard → detailed view of specific appointment(s) by client name
- SlotPicker      → available time slot picker — book a slot for a client
- ReminderSender  → list upcoming appointments with a "Remind" button to email the client
- EmptyState      → shown when nothing relevant exists
- ProjectBoard    → kanban board for projects (todo/in-progress/review/done/on-hold)
- TaskBoard       → task list with checkboxes per project
- TimeTracker     → start/stop timer for billable hours
- ProjectProfit   → budget vs hours = hourly rate per project

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW TO HANDLE DIFFERENT MESSAGES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

GREETINGS ("hi", "hello", "hey", "good morning", "what's up"):
→ changeUI: false. Reply warmly, introduce yourself briefly.

GRATITUDE ("thanks", "great", "awesome", "perfect"):
→ changeUI: false. Reply warmly.

HELP / CAPABILITIES ("what can you do", "help me", "how does this work"):
→ changeUI: false. Explain what you can do in 2-3 sentences, conversationally.

CALENDAR / APPOINTMENTS ("show calendar", "schedule meeting", "what meetings this week", "cancel meeting"):
→ changeUI: true, components: ["BookingCalendar"]
  • "show calendar" / "my schedule" / "appointments" = just show the calendar, action: "none"
  • "schedule" / "book" / "set up meeting" / "arrange call" = action: "create_appointment"
    - Extract: clientName, date (resolve relative dates to YYYY-MM-DD), time (24h HH:mm), title
  • BULK create ("schedule 3 calls with Priya, Rahul, Sam next week", "book multiple meetings") = action: "create_appointments_bulk"
    - appointmentData.meetings MUST be an array of objects, each with: "date" (YYYY-MM-DD), "time" (HH:mm), optional "clientName", optional "title", optional "notes"
    - Example: two clients different days → "meetings": [{ "clientName": "Priya", "date": "2026-05-14", "time": "10:00" }, { "clientName": "Rahul", "date": "2026-05-15", "time": "14:00" }]
  • "what meetings" / "meetings this week" = action: "none", filters: { week: "current" }
  • SINGLE cancel ("cancel my meeting with Rahul", "remove Priya's call") = action: "cancel_appointment", appointmentData: { clientName }
  • BULK cancel — action: "cancel_appointments_bulk". Pick bulkScope by INTENT (not keywords alone). Use [TODAY] for every relative date.

  ═══ DATE vs MONTH (critical — users get angry if you confuse these) ═══
  • ONE calendar day + client → bulkScope: "date_client" + appointmentData.date "YYYY-MM-DD" + clientName.
    Examples: "cancel meetings with Srija on the 18th", "wipe my calls with Rahul on May 18", "clear Priya on 18/5", "drop everything with Sam tomorrow" (date = day after [TODAY]).
    "The 18th" / "on the 18th" without a different month → use the month from [TODAY] unless they said another month (e.g. "June 18" → that month-day).
    NEVER use month_client for these — month_client cancels EVERY meeting that month with that client.

  • WHOLE calendar month (no specific day) → bulkScope: "month" OR "month_client" + month "YYYY-MM".
    Examples: "cancel all my meetings this month", "clear everything with Priya in May", "wipe May for Rahul", "all of June".
    Phrases like "this month", "whole May", "entire month", "everything in May" → month / month_client, NOT date_client.

  • If the user names BOTH a month and a single day ("Srija on the 18th" in May) → date_client with that full date (e.g. 2026-05-18), NOT month_client.

  • Other bulk scopes (unchanged):
    - "cancel all meetings with Priya" (no month, no day) → bulkScope: "client", clientName
    - Multiple clients → clientName comma-separated: "Priya, Rahul" with bulkScope: "client" or "month_client" or "date_client" as appropriate
    - "cancel everything upcoming" → bulkScope: "all_future"

  • GOOGLE CALENDAR (events synced from Google, link icon): FreelanceOS cannot edit Google. When the user syncs, meetings removed or cancelled in Google are marked cancelled here. For native-only rows, use cancel actions. If they only have Google-linked events, tell them to change Google Calendar and sync again.
  • MANDATORY: If action is create_appointment, create_appointments_bulk, cancel_appointment, or cancel_appointments_bulk, put "BookingCalendar" FIRST in components (that component performs the action). Never use only StatsBar/ClientTable for those actions.

APPOINTMENT DETAILS ("show my meeting with Priya", "what's my call with Rahul"):
→ changeUI: true, components: ["AppointmentCard"]
  - Extract clientName into appointmentData: { clientName: "Priya" }
  - Example: "show my meeting with Priya" → { "components": ["AppointmentCard"], "appointmentData": { "clientName": "Priya" } }

BOOKING SLOT ("send booking link to Rahul", "pick a time for client", "schedule slot", "find a time"):
→ changeUI: true, components: ["SlotPicker"]
  - Extract clientName into appointmentData if mentioned
  - Example: "send booking link to Rahul" → { "components": ["SlotPicker"], "appointmentData": { "clientName": "Rahul" } }

REMINDERS ("remind Rahul about tomorrow", "send reminder", "nudge client about call"):
→ changeUI: true, components: ["ReminderSender"]
  - Extract clientName into appointmentData if mentioned
  - Example: "remind Rahul about tomorrow's call" → { "components": ["ReminderSender"], "appointmentData": { "clientName": "Rahul" } }

PROJECTS & TIME TRACKING ("show projects", "my tasks", "start timer", "profitability"):
→ changeUI: true
  • "projects", "kanban", "board" → ProjectBoard
  • "tasks", "todo", "my tasks" → TaskBoard
  • "timer", "track time", "start timer", "stop timer" → TimeTracker
  • "profit", "hourly rate", "project earnings" → ProjectProfit
  • "new project", "create project", "add a project named …" → changeUI: true, components: ["ProjectBoard"], action: "none"
    NEVER set action to "create_project". Projects are created by the command bar (client); you only open ProjectBoard.
  • TASKS BY PROJECT — "show tasks in X", "tasks in X", etc. → components: ["TaskBoard","ProjectBoard"], action: "none"
  
  ═══ EDIT PROJECT (critical new feature) ═══
  • "edit project [name]", "open [name] project settings", "modify project [name]", "change [name] project", "update project [name]" → 
    action: "edit_project"
    components: ["ProjectBoard"]
    projectData: { title: "<extracted project name>" }
    Reply: short confirmation like "Opening [name] for editing ✏️"
  • Extract the project name as accurately as possible from the user's message.
  • Examples:
    - "edit project Acme Corp" → projectData: { title: "Acme Corp" }, action: "edit_project"
    - "open Acme settings" → projectData: { title: "Acme" }, action: "edit_project"
    - "I want to change the deadline on Acme Corp project" → projectData: { title: "Acme Corp" }, action: "edit_project"
    - "update budget for my Acme project" → projectData: { title: "Acme" }, action: "edit_project"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DATE/TIME AWARENESS (CRITICAL):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
You will be given the current date and time in the user message as [TODAY: YYYY-MM-DD, DAY_OF_WEEK].
ALWAYS use this to resolve relative dates:
  • "today" → the date provided
  • "tomorrow" → the day after the date provided
  • "next Monday" → the next Monday after the date provided
  • "day after tomorrow" → two days after
  • For bulk cancel: "the 18th" / "on the 18th" with a client → one calendar day only: bulkScope "date_client" and date YYYY-MM-DD (use [TODAY]'s year-month for "the 18th" unless they said another month).
NEVER guess or hallucinate a date. ALWAYS calculate from the provided date.

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
  • ANY person name mentioned = ClientTable with { "search": "<that name>" } filter

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
  "components": ["ProjectBoard"],
  "filters": {},
  "action": "edit_project",
  "projectData": { "title": "Acme Corp" },
  "emptyMessage": ""
}

Return ONLY valid JSON. Nothing outside the JSON object.`

// Helper: generic fallback response
function genericFallback(): AriaResponse {
    return {
        reply: "I'm here to help with your freelance business. Ask me about clients, invoices, payments, or anything related!",
        changeUI: false,
    }
}

export async function POST(req: Request) {
    let body: Record<string, unknown> = {}
    try {
        body = (await req.json()) as Record<string, unknown>
    } catch {
        body = {}
    }

    const prompt = typeof body.prompt === 'string' ? body.prompt : ''
    const history = Array.isArray(body.history) ? body.history : []
    const mode = body.mode

    // ─── COMMAND HINTS MODE ───────────────────────────────────────────────────
    if (mode === 'command_hints') {
        const sc = body.suggestionContext as
            | { projects?: unknown; clients?: unknown; workspaceMode?: unknown }
            | undefined
        const projectList = Array.isArray(sc?.projects)
            ? sc!.projects!.map(String).filter(Boolean).slice(0, 16)
            : []
        const clientList = Array.isArray(sc?.clients)
            ? sc!.clients!.map(String).filter(Boolean).slice(0, 16)
            : []
        const workspaceMode = Boolean(sc?.workspaceMode)
        const query = typeof body.query === 'string' ? body.query.trim() : ''

        if (!process.env.OPENROUTER_API_KEY) {
            return Response.json({ hints: [] as string[] })
        }

        try {
            const sys = `You generate command suggestions for FreelanceOS, a freelance business dashboard.
You know ALL features:
• Clients: show all, filter by city/status/name, add new
• Invoices: show list, filter paid/overdue/draft/sent, create new
• Payments: payment status, overdue breakdown
• Calendar: show calendar, schedule/cancel meetings (single or bulk), slot picker, send reminders
• Projects: kanban board (not_started/in_progress/review/done/on_hold), create, edit status, view profitability
  - "edit project [name]" opens the edit modal for that project
• Tasks: task board, add tasks, filter by project/due date/overdue, toggle done/todo
• Time Tracker: start/stop timer, view billable hours, time entries

Return ONLY valid JSON: {"hints": string[]}
Rules:
- 6-8 hints max
- Under 9 words each
- Use actual client/project names provided — NEVER invent fake names
- If user typed a query, prioritize hints matching that intent
- Mix categories: scheduling, invoices, clients, tasks, projects, payments, time tracking
- Make them specific ("Schedule call with Priya" not "Schedule a call")
- No markdown, no extra keys, no explanations`

            let userMsg: string
            if (query) {
                userMsg = `User is typing: "${query}"
Available projects: ${projectList.length ? projectList.join(', ') : 'none'}.
Available clients: ${clientList.length ? clientList.join(', ') : 'none'}.
Generate 6-8 hints that closely match the intent of "${query}". Return ONLY JSON.`
            } else if (workspaceMode) {
                userMsg = `User is in the project/task workspace.
Projects: ${projectList.length ? projectList.join(', ') : 'none yet'}.
Clients: ${clientList.length ? clientList.join(', ') : 'none yet'}.
Generate 6-8 workspace-specific commands. Good examples:
- show tasks in ${projectList[0] ?? 'ProjectName'}
- put project ${projectList[0] ?? 'ProjectName'} on hold
- add task Write proposal to ${projectList[0] ?? 'ProjectName'}
- edit project ${projectList[0] ?? 'ProjectName'}
- mark project ${projectList[1] ?? 'ProjectName'} as in progress
- start timer for ${projectList[0] ?? 'ProjectName'}
- show project profitability
- move ${projectList[0] ?? 'ProjectName'} to review`
            } else {
                userMsg = `User is on the main freelance dashboard.
Clients: ${clientList.length ? clientList.join(', ') : 'none yet'}.
Projects: ${projectList.length ? projectList.join(', ') : 'none yet'}.
Generate 6-8 commands. Good examples:
- Who hasn't paid me this month?
- Schedule call with ${clientList[0] ?? 'ClientName'} tomorrow
- Show overdue invoices
- Cancel meeting with ${clientList[1] ?? 'ClientName'}
- Create invoice for ${clientList[0] ?? 'ClientName'}
- Send reminder to ${clientList[0] ?? 'ClientName'}
- Show project profitability
- Start timer`
            }

            const result = await generateText({
                model: openrouter('google/gemini-2.0-flash-001'),
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: userMsg },
                ],
                temperature: 0.45,
                maxOutputTokens: 320,
            })

            const raw = result.text?.replace(/```json\s*/g, '').replace(/```/g, '').trim() ?? ''
            const jsonMatch = raw.match(/\{[\s\S]*\}/)
            if (!jsonMatch) return Response.json({ hints: [] as string[] })

            const parsed = JSON.parse(jsonMatch[0]) as { hints?: unknown }
            const hints = Array.isArray(parsed.hints)
                ? parsed.hints
                      .map((h) => String(h).trim())
                      .filter((h) => h.length > 0 && h.length < 60)
                      .slice(0, 8)
                : []
            return Response.json({ hints })
        } catch {
            return Response.json({ hints: [] as string[] })
        }
    }

    // ─── MAIN ARIA CHAT MODE ──────────────────────────────────────────────────

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
            maxOutputTokens: 450,
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
        const response = reconcileBulkCancelDayVsMonth(prompt, sanitise(parsed))

        console.log(`[Aria] "${prompt}" → "${response.reply}" (changeUI: ${response.changeUI}, action: ${response.action})`)
        return Response.json(response)

    } catch (err: unknown) {
        console.error('[Aria] Error:', (err as Error)?.message || err)

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
                reply: "I can manage clients, invoices, payments, projects, and give you quick stats — just ask!",
                changeUI: false,
            } satisfies AriaResponse)
        }

        // Edit project fallback
        if (/\b(edit|modify|update|change|open)\b.*\b(project)\b/i.test(prompt)) {
            const nameMatch = prompt.match(/(?:edit|modify|update|change|open)\s+(?:project\s+)?(.+?)(?:\s+project)?$/i)
            const title = nameMatch?.[1]?.trim()
            return Response.json({
                reply: title ? `Opening ${title} for editing ✏️` : "Opening project editor",
                changeUI: true,
                components: ['ProjectBoard'],
                action: 'edit_project',
                projectData: title ? { title } : undefined,
            } satisfies AriaResponse)
        }

        // Business-related query — show default dashboard
        const businessPattern = /\b(client|clients|invoice|invoices|payment|payments|earn|revenue|money|due|overdue|paid|stats|city|active|inactive|bill|billing)\b/i
        if (businessPattern.test(prompt)) {
            const components: Component[] = []
            if (/\b(invoice|invoices|bill|billing)\b/i.test(prompt)) {
                if (/\b(create|new|make|generate)\b/i.test(prompt)) components.push('InvoiceBuilder')
                else components.push('InvoiceList')
            }
            if (/\b(client|clients)\b/i.test(prompt)) components.push('ClientTable')
            if (/\b(payment|payments)\b/i.test(prompt)) components.push('PaymentStatus')
            if (/\b(earn|revenue|money|stats)\b/i.test(prompt)) components.push('StatsBar')
            if (components.length === 0) components.push('StatsBar', 'ClientTable')

            const filters: AriaResponse['filters'] = {}
            if (/\b(active)\b/i.test(prompt) && !/\b(inactive|non.?active|not.?active)\b/i.test(prompt)) filters.status = 'active'
            else if (/\b(inactive|non.?active|not.?active)\b/i.test(prompt)) filters.status = 'inactive'
            if (/\b(paid)\b/i.test(prompt)) filters.status = 'paid'
            else if (/\b(overdue|unpaid|due|pending)\b/i.test(prompt)) filters.status = 'overdue'

            return Response.json({
                reply: "Let me pull that up for you! 📊",
                changeUI: true,
                components,
                filters,
                action: 'none',
            } satisfies AriaResponse)
        }

        const calendarPattern = /\b(meeting|meetings|appointment|appointments|calendar|schedule|book|booking|call|calls|slot|reminder|remind|cancel)\b/i;
        if (calendarPattern.test(prompt)) {
            const isCancel = /\b(cancel|remove|delete|clear|wipe|drop)\b/i.test(prompt);
            const isCreate = /\b(schedule|book|set up|arrange|create|add|new)\b/i.test(prompt);
            return Response.json({
                reply: isCancel ? "Let me open the calendar for that." : isCreate ? "Opening the calendar to schedule that!" : "Here's your calendar 📅",
                changeUI: true,
                components: ['BookingCalendar'],
                action: 'none',
            } satisfies AriaResponse);
        }

        // For any other error, return a generic fallback without UI change
        return Response.json(genericFallback() satisfies AriaResponse)
    }
}