import { supabaseAdmin } from '@/lib/supabase-admin'
import { auth } from '@clerk/nextjs/server'
import { Resend } from 'resend'
import { getClerkUserEmail, SOLOOS_FROM_EMAIL, SOLOOS_RAW_EMAIL, uniqueRecipients } from '@/lib/email-delivery'

const resend = new Resend(process.env.RESEND_API_KEY)

const GOOGLE_READONLY =
    'This event is synced from Google Calendar — we only have read access here. Change or cancel it in Google Calendar.'

function isNativeAppointment(source: string | null | undefined) {
    return source !== 'google_calendar'
}

/** Fuzzy match: "Amit Kumar" matches client "Amit", "Amit K.", etc. */
async function resolveClientIdByHint(userId: string, hint: string): Promise<string | null> {
    const q = hint.trim()
    if (!q) return null
    const { data: rows, error } = await supabaseAdmin.from('clients').select('id, name').eq('user_id', userId)
    if (error || !rows?.length) return null
    const ql = q.toLowerCase()
    type Row = { id: string; name: string | null }
    const scored = (rows as Row[])
        .map((c) => {
            const n = (c.name || '').toLowerCase()
            let score = 0
            if (n === ql) score = 100
            else if (n.includes(ql)) score = 85
            else if (ql.includes(n) && n.length >= 2) score = 70
            else {
                const parts = ql.split(/\s+/).filter((p) => p.length > 1)
                if (parts.length && parts.every((p) => n.includes(p))) score = 55
                else if (parts.some((p) => p.length >= 3 && n.includes(p))) score = 35
            }
            return { id: c.id, name: c.name, score }
        })
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || (b.name?.length ?? 0) - (a.name?.length ?? 0))
    return scored[0]?.id ?? null
}

/** "Priya, Rahul" → ["Priya", "Rahul"] for bulk cancel across clients */
function splitClientNameList(raw: string | undefined): string[] {
    if (!raw?.trim()) return []
    return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
}

// Format date to iCal format: 20260511T150000Z
function toICSDate(d: Date): string {
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

// Generate .ics calendar invite content
function generateICS(opts: {
    id: string
    title: string
    start: Date
    end: Date
    description?: string
    organizerEmail: string
    attendeeEmail?: string
}): string {
    const lines = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//SoloOS//Appointments//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:REQUEST',
        'BEGIN:VEVENT',
        `UID:${opts.id}@soloos`,
        `DTSTART:${toICSDate(opts.start)}`,
        `DTEND:${toICSDate(opts.end)}`,
        `SUMMARY:${opts.title}`,
        `DESCRIPTION:${opts.description || 'Scheduled via SoloOS'}`,
        `ORGANIZER;CN=SoloOS:mailto:${opts.organizerEmail}`,
        opts.attendeeEmail ? `ATTENDEE;RSVP=TRUE;CN=${opts.attendeeEmail}:mailto:${opts.attendeeEmail}` : '',
        `STATUS:CONFIRMED`,
        `DTSTAMP:${toICSDate(new Date())}`,
        'END:VEVENT',
        'END:VCALENDAR',
    ].filter(Boolean)
    return lines.join('\r\n')
}

// ── READ ──────────────────────────────────────────────────────────────────────
// GET /api/appointments?startDate=ISO&endDate=ISO
export async function GET(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    const startDate = url.searchParams.get('startDate')
    const endDate = url.searchParams.get('endDate')

    let query = supabaseAdmin
        .from('appointments')
        .select('*, clients(id, name)')
        .eq('user_id', userId)
        // Don't filter by status = 'scheduled' if you want to show all
        // Don't exclude google_calendar events
        .order('start_time', { ascending: true })

    if (startDate) query = query.gte('start_time', startDate)
    if (endDate) query = query.lte('start_time', endDate)

    const { data, error } = await query

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ data: data || [] })
}

export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { action, ...payload } = body

    // ── CREATE ──────────────────────────────────────────────────────────────
    if (action === 'create') {
        const { clientId, title, startTime, endTime, notes, durationMinutes } = payload

        if (!title || !startTime) {
            return Response.json({ error: 'title and startTime are required' }, { status: 400 })
        }

        // end_time: use provided value, or durationMinutes offset, or default 1 hour
        const start = new Date(startTime)
        const end = endTime
            ? new Date(endTime)
            : new Date(start.getTime() + (durationMinutes ?? 60) * 60 * 1000)

        const { data, error } = await supabaseAdmin
            .from('appointments')
            .insert({
                user_id: userId,
                client_id: clientId || null,
                title,
                start_time: start.toISOString(),
                end_time: end.toISOString(),
                notes: notes || null,
                status: 'scheduled',
            })
            .select()
            .single()

        if (error) return Response.json({ error: error.message }, { status: 500 })

        // Send calendar invite email to client (fire-and-forget, don't block response)
        if (clientId && data) {
            sendCalendarInvite(userId, data.id, clientId, title, start, end, notes).catch(console.error)
        }

        return Response.json({ data, emailSent: !!clientId })
    }

    // ── BULK CREATE (native meetings; same rules as create) ─────────────────
    if (action === 'create_bulk') {
        const meetings = payload.meetings as Array<{
            clientId?: string | null
            clientName?: string
            title?: string
            startTime?: string
            endTime?: string | null
            notes?: string | null
            durationMinutes?: number
        }>

        if (!Array.isArray(meetings) || meetings.length === 0) {
            return Response.json({ error: 'meetings must be a non-empty array' }, { status: 400 })
        }
        if (meetings.length > 40) {
            return Response.json({ error: 'Maximum 40 meetings per request' }, { status: 400 })
        }

        let createdCount = 0
        for (const m of meetings) {
            const title = typeof m.title === 'string' ? m.title.trim() : ''
            const startTime = m.startTime
            if (!title || !startTime) continue

            let resolvedClientId: string | null = typeof m.clientId === 'string' && m.clientId ? m.clientId : null
            if (!resolvedClientId && typeof m.clientName === 'string' && m.clientName.trim()) {
                resolvedClientId = await resolveClientIdByHint(userId, m.clientName.trim())
            }

            const start = new Date(startTime)
            const end = m.endTime
                ? new Date(m.endTime)
                : new Date(start.getTime() + (m.durationMinutes ?? 60) * 60 * 1000)

            const { data, error } = await supabaseAdmin
                .from('appointments')
                .insert({
                    user_id: userId,
                    client_id: resolvedClientId,
                    title,
                    start_time: start.toISOString(),
                    end_time: end.toISOString(),
                    notes: m.notes || null,
                    status: 'scheduled',
                })
                .select()
                .single()

            if (error) continue
            createdCount++
            if (resolvedClientId && data) {
                sendCalendarInvite(userId, data.id, resolvedClientId, title, start, end, m.notes ?? undefined).catch(console.error)
            }
        }

        if (createdCount === 0) {
            return Response.json(
                { error: 'No meetings were created — check client names, dates, and times.' },
                { status: 400 },
            )
        }
        return Response.json({ ok: true, createdCount })
    }

    // ── RESCHEDULE ───────────────────────────────────────────────────────────
    if (action === 'reschedule') {
        const { id, startTime, durationMinutes } = payload

        if (!id || !startTime) {
            return Response.json({ error: 'id and startTime are required' }, { status: 400 })
        }

        const { data: existing } = await supabaseAdmin
            .from('appointments')
            .select('source')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle()

        if (!existing) return Response.json({ error: 'Appointment not found' }, { status: 404 })
        if (!isNativeAppointment(existing.source)) {
            return Response.json({ error: GOOGLE_READONLY }, { status: 409 })
        }

        const start = new Date(startTime)
        const end = new Date(start.getTime() + (durationMinutes ?? 60) * 60 * 1000)

        const { error } = await supabaseAdmin
            .from('appointments')
            .update({ start_time: start.toISOString(), end_time: end.toISOString() })
            .eq('id', id)
            .eq('user_id', userId)

        if (error) return Response.json({ error: error.message }, { status: 500 })
        return Response.json({ ok: true })
    }

    // ── CANCEL ───────────────────────────────────────────────────────────────
    if (action === 'cancel') {
        const { id } = payload

        if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

        const { data: existing } = await supabaseAdmin
            .from('appointments')
            .select('source')
            .eq('id', id)
            .eq('user_id', userId)
            .maybeSingle()

        if (!existing) return Response.json({ error: 'Appointment not found' }, { status: 404 })
        if (!isNativeAppointment(existing.source)) {
            return Response.json({ error: GOOGLE_READONLY }, { status: 409 })
        }

        const { error } = await supabaseAdmin
            .from('appointments')
            .update({ status: 'cancelled' })
            .eq('id', id)
            .eq('user_id', userId)

        if (error) return Response.json({ error: error.message }, { status: 500 })
        return Response.json({ ok: true })
    }

    // ── CANCEL BY CLIENT NAME (AI action) ────────────────────────────────────
    if (action === 'cancel_by_client') {
        const { clientName } = payload
        if (!clientName) return Response.json({ error: 'clientName is required' }, { status: 400 })

        const clientId = await resolveClientIdByHint(userId, clientName)
        if (!clientId) return Response.json({ error: `No client named "${clientName}"` }, { status: 404 })

        const hint = clientName.trim().replace(/[%_\\,]/g, ' ').replace(/\s+/g, ' ').trim()
        const { data: byClient } = await supabaseAdmin
            .from('appointments')
            .select('id, title, start_time, source')
            .eq('user_id', userId)
            .eq('client_id', clientId)
            .eq('status', 'scheduled')
            .order('start_time', { ascending: true })
            .limit(40)

        const rows: { id: string; title: string; start_time: string; source: string | null }[] = [...(byClient || [])]
        if (hint.length >= 2) {
            const { data: byTitle } = await supabaseAdmin
                .from('appointments')
                .select('id, title, start_time, source')
                .eq('user_id', userId)
                .is('client_id', null)
                .eq('status', 'scheduled')
                .or(`title.ilike.%${hint}%,notes.ilike.%${hint}%`)
                .order('start_time', { ascending: true })
                .limit(40)
            const seen = new Set(rows.map((r) => r.id))
            for (const r of byTitle || []) {
                if (!seen.has(r.id)) {
                    seen.add(r.id)
                    rows.push(r)
                }
            }
        }

        // Prefer JS cutoff vs SQL gte — avoids timestamptz / clock skew mismatches with the UI
        const graceMs = 5 * 60 * 1000
        const cutoff = Date.now() - graceMs
        const nativeUpcoming = rows
            .filter((a) => isNativeAppointment(a.source) && new Date(a.start_time).getTime() >= cutoff)
            .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())

        const target = nativeUpcoming[0]
        if (!target) {
            return Response.json({
                error: `No cancellable SoloOS meeting with ${clientName} (check it is scheduled, not only in Google Calendar, and linked to the client or named in the title).`,
            }, { status: 404 })
        }

        await supabaseAdmin.from('appointments').update({ status: 'cancelled' }).eq('id', target.id)
        return Response.json({ ok: true, cancelled: { id: target.id, title: target.title, start_time: target.start_time } })
    }

    // ── BULK CANCEL (native meetings only; Google sync rows untouched) ────────
    if (action === 'cancel_bulk') {
        const bulkScope = payload.bulkScope as string | undefined
        const month = payload.month as string | undefined
        const clientName = payload.clientName as string | undefined

        const dayDate = payload.date as string | undefined

        const allowed = new Set(['month', 'client', 'month_client', 'date_client', 'all_future'])
        if (!bulkScope || !allowed.has(bulkScope)) {
            return Response.json({
                error: 'bulkScope must be month, client, month_client, date_client, or all_future',
            }, { status: 400 })
        }
        if ((bulkScope === 'month' || bulkScope === 'month_client') && !month?.trim()) {
            return Response.json({ error: 'month (YYYY-MM) is required for this bulk action' }, { status: 400 })
        }
        if (bulkScope === 'date_client' && !dayDate?.trim()) {
            return Response.json({ error: 'date (YYYY-MM-DD) is required for date_client' }, { status: 400 })
        }
        if ((bulkScope === 'client' || bulkScope === 'month_client' || bulkScope === 'date_client') && !clientName?.trim()) {
            return Response.json({ error: 'clientName is required for this bulk action' }, { status: 400 })
        }

        let clientIds: string[] = []
        if (bulkScope === 'client' || bulkScope === 'month_client' || bulkScope === 'date_client') {
            const hints = splitClientNameList(clientName)
            for (const h of hints) {
                const id = await resolveClientIdByHint(userId, h)
                if (id) clientIds.push(id)
            }
            clientIds = [...new Set(clientIds)]
            if (clientIds.length === 0) {
                return Response.json({ error: `No client matched "${clientName}"` }, { status: 404 })
            }
        }

        const nowIso = new Date().toISOString()
        let startIso: string | undefined
        let endIso: string | undefined
        if (bulkScope === 'month' || bulkScope === 'month_client') {
            const parts = month!.trim().split('-').map(Number)
            const y = parts[0]
            const m = parts[1]
            if (!y || !m || m < 1 || m > 12) {
                return Response.json({ error: 'month must be YYYY-MM' }, { status: 400 })
            }
            startIso = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0)).toISOString()
            endIso = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString()
        } else if (bulkScope === 'date_client') {
            const parts = dayDate!.trim().split('-').map(Number)
            const y = parts[0]
            const m = parts[1]
            const d = parts[2]
            if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) {
                return Response.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
            }
            startIso = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)).toISOString()
            endIso = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999)).toISOString()
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const applyTime = (q: any) => {
            let out = q
            if (startIso && endIso) out = out.gte('start_time', startIso).lte('start_time', endIso)
            else if (bulkScope === 'client' || bulkScope === 'all_future') out = out.gte('start_time', nowIso)
            return out
        }

        let rows: { id: string; source: string | null }[] = []

        if (bulkScope === 'client' || bulkScope === 'month_client' || bulkScope === 'date_client') {
            let qByClient = applyTime(
                supabaseAdmin
                    .from('appointments')
                    .select('id, source')
                    .eq('user_id', userId)
                    .eq('status', 'scheduled'),
            )
            qByClient =
                clientIds.length === 1
                    ? qByClient.eq('client_id', clientIds[0]!)
                    : qByClient.in('client_id', clientIds)
            const { data: byClient, error: e1 } = await qByClient
            if (e1) return Response.json({ error: e1.message }, { status: 500 })
            rows = [...(byClient || [])]

            for (const namePart of splitClientNameList(clientName)) {
                const hint = namePart.replace(/[%_\\,]/g, ' ').replace(/\s+/g, ' ').trim()
                if (hint.length < 2) continue
                const qByTitle = applyTime(
                    supabaseAdmin
                        .from('appointments')
                        .select('id, source')
                        .eq('user_id', userId)
                        .eq('status', 'scheduled')
                        .is('client_id', null)
                        .or(`title.ilike.%${hint}%,notes.ilike.%${hint}%`),
                )
                const { data: byTitle, error: e2 } = await qByTitle
                if (e2) return Response.json({ error: e2.message }, { status: 500 })
                const seen = new Set(rows.map((r) => r.id))
                for (const r of byTitle || []) {
                    if (!seen.has(r.id)) {
                        seen.add(r.id)
                        rows.push(r)
                    }
                }
            }
        } else {
            let query = supabaseAdmin
                .from('appointments')
                .select('id, source')
                .eq('user_id', userId)
                .eq('status', 'scheduled')
            query = applyTime(query)
            const { data: r2, error: selErr } = await query
            if (selErr) return Response.json({ error: selErr.message }, { status: 500 })
            rows = r2 || []
        }

        const nativeIds = rows.filter((r) => isNativeAppointment(r.source)).map((r) => r.id)
        if (nativeIds.length === 0) {
            return Response.json({ ok: true, cancelledCount: 0 })
        }

        const { error: updErr } = await supabaseAdmin
            .from('appointments')
            .update({ status: 'cancelled' })
            .in('id', nativeIds)
            .eq('user_id', userId)

        if (updErr) return Response.json({ error: updErr.message }, { status: 500 })
        return Response.json({ ok: true, cancelledCount: nativeIds.length })
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Send calendar invite email ──────────────────────────────────────────────
async function sendCalendarInvite(
    userId: string,
    appointmentId: string,
    clientId: string,
    title: string,
    start: Date,
    end: Date,
    notes?: string,
) {
    // Look up client email
    const { data: client } = await supabaseAdmin
        .from('clients')
        .select('name, email')
        .eq('id', clientId)
        .single()

    if (!client?.email) return // no email on file, skip silently

    // Look up organizer info (the freelancer)
    const userEmail = await getClerkUserEmail(userId)
    const recipients = uniqueRecipients(client.email, userEmail)

    const icsContent = generateICS({
        id: appointmentId,
        title,
        start,
        end,
        description: notes || `Scheduled via SoloOS`,
        organizerEmail: SOLOOS_RAW_EMAIL,
        attendeeEmail: client.email,
    })

    const icsBuffer = Buffer.from(icsContent, 'utf-8')

    await resend.emails.send({
        from: SOLOOS_FROM_EMAIL,
        to: recipients,
        subject: `📅 Meeting Invite: ${title}`,
        html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #7c3aed; margin-bottom: 4px;">You're invited!</h2>
                <p style="color: #555; margin-top: 0;">${title}</p>
                <table style="border-collapse: collapse; margin: 16px 0;">
                    <tr>
                        <td style="padding: 6px 12px 6px 0; color: #888; font-size: 14px;">📅 Date</td>
                        <td style="padding: 6px 0; font-size: 14px; font-weight: 500;">${start.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px 12px 6px 0; color: #888; font-size: 14px;">🕐 Time</td>
                        <td style="padding: 6px 0; font-size: 14px; font-weight: 500;">${start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                    </tr>
                    ${notes ? `<tr><td style="padding: 6px 12px 6px 0; color: #888; font-size: 14px;">📝 Notes</td><td style="padding: 6px 0; font-size: 14px;">${notes}</td></tr>` : ''}
                </table>
                <p style="font-size: 13px; color: #666;">Open the attached <strong>.ics</strong> file to add this to your calendar.</p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="color: #999; font-size: 12px;">Sent via SoloOS</p>
            </div>
        `,
        attachments: [
            {
                filename: 'invite.ics',
                content: icsBuffer,
                contentType: 'text/calendar; method=REQUEST',
            },
        ],
    })
}
