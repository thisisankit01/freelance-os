import { auth, clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/** Same key as used when inserting / deduping Google rows (title + UTC start). */
function googleEventFingerprint(summary: string | null | undefined, rawStart: string | undefined) {
    if (!rawStart) return null
    const startIso = new Date(rawStart).toISOString()
    return `${(summary || '').trim()}|${startIso}`
}

export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    try {
        const client = await clerkClient()
        const { data: tokens } = await client.users.getUserOauthAccessToken(userId, 'oauth_google')

        console.log('Tokens response:', tokens) // Debug log

        const accessToken = tokens?.[0]?.token

        if (!accessToken) {
            return Response.json({ error: 'Google Calendar not connected. Please sign in with Google.' }, { status: 400 })
        }

        console.log('Access token found, length:', accessToken.length) // Debug log

        // Fetch calendar events
        const now = new Date().toISOString()
        const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

        const eventsRes = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${thirtyDays}&singleEvents=true`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        )

        if (!eventsRes.ok) {
            const error = await eventsRes.json()
            console.error('Google API error:', error)
            return Response.json({ error: 'Failed to fetch calendar', details: error }, { status: 500 })
        }

        const events = await eventsRes.json()

        // Get user's clients for email matching
        const { data: clients } = await supabaseAdmin
            .from('clients')
            .select('id, email, name')
            .eq('user_id', userId)



        const clientEmails = new Map(clients?.map(c => [c.email?.toLowerCase(), c.id]) || [])

        // Filter events that match client emails (exclude cancelled — API may omit them, but be explicit)
        const matchedEvents = (events.items || []).filter((event: unknown) => {
            if ((event as { status?: string }).status === 'cancelled') return false
            const attendees = (event as { attendees?: unknown[] }).attendees || []
            return attendees.some((a: unknown) => clientEmails.has((a as { email?: string }).email?.toLowerCase()))
        })

        // After fetching events, add this logging:
        console.log('Total Google events:', events.items?.length || 0)
        console.log('First few events:', events.items?.slice(0, 3).map((e: unknown) => ({
            title: (e as { summary?: string }).summary,
            start: (e as { start?: { dateTime?: string; date?: string } }).start?.dateTime || (e as { start?: { dateTime?: string; date?: string } }).start?.date,
            attendees: (e as { attendees?: unknown[] }).attendees?.map((a: unknown) => (a as { email?: string }).email) || []
        })))

        // After matching, add:
        console.log('Your clients:', clients?.map((c: { name?: string; email?: string }) => ({ name: c.name, email: c.email })))
        console.log('Matched events:', matchedEvents.map((e: { summary?: string; attendees?: unknown[] }) => ({
            title: e.summary,
            attendee: (e.attendees?.find((a: unknown) => !(a as { self?: boolean }).self) as { email?: string })?.email
        })))

        // Reconcile: Google no longer returns cancelled/deleted events by default — mark stale copies cancelled
        const activeFingerprints = new Set<string>()
        for (const event of matchedEvents) {
            const rawStart = event.start?.dateTime || event.start?.date
            const fp = googleEventFingerprint(event.summary, rawStart)
            if (fp) activeFingerprints.add(fp)
        }

        const { data: googleRows } = await supabaseAdmin
            .from('appointments')
            .select('id, title, start_time')
            .eq('user_id', userId)
            .eq('source', 'google_calendar')
            .eq('status', 'scheduled')
            .gte('start_time', now)
            .lte('start_time', thirtyDays)

        const staleIds = (googleRows || [])
            .map((row) => {
                const fp = googleEventFingerprint(row.title, row.start_time)
                return fp && !activeFingerprints.has(fp) ? row.id : null
            })
            .filter((id): id is string => Boolean(id))

        let markedCancelled = 0
        if (staleIds.length > 0) {
            const { error: cancelErr } = await supabaseAdmin
                .from('appointments')
                .update({ status: 'cancelled' })
                .in('id', staleIds)
                .eq('user_id', userId)
            if (!cancelErr) markedCancelled = staleIds.length
        }

        // Store as external appointments
        let synced = 0
        for (const event of matchedEvents) {
            const attendee = event.attendees?.find((a: unknown) =>
                !(a as { self?: boolean }).self && clientEmails.has((a as { email?: string }).email?.toLowerCase())
            )
            const clientId = clientEmails.get(attendee?.email?.toLowerCase())

            // Normalise to UTC ISO so dedupe + Supabase timestamptz comparisons are consistent
            const rawStart = (event as { start?: { dateTime?: string; date?: string } }).start?.dateTime || (event as { start?: { dateTime?: string; date?: string } }).start?.date
            const rawEnd = (event as { end?: { dateTime?: string; date?: string } }).end?.dateTime || (event as { end?: { dateTime?: string; date?: string } }).end?.date
            const startIso = rawStart ? new Date(rawStart).toISOString() : ''
            const endIso = rawEnd ? new Date(rawEnd).toISOString() : ''

            // Dedupe: match on title + normalised UTC start_time
            // Use a 1-minute window to handle any rounding differences
            const winStart = new Date(new Date(startIso).getTime() - 60_000).toISOString()
            const winEnd = new Date(new Date(startIso).getTime() + 60_000).toISOString()
            const { data: existing } = await supabaseAdmin
                .from('appointments')
                .select('id')
                .eq('user_id', userId)
                .eq('title', event.summary)
                .gte('start_time', winStart)
                .lte('start_time', winEnd)
                .maybeSingle()

            if (existing) continue

            const { error } = await supabaseAdmin
                .from('appointments')
                .insert({
                    user_id: userId,
                    client_id: clientId,
                    title: event.summary,
                    start_time: startIso,
                    end_time: endIso,
                    status: 'scheduled',
                    notes: event.description || null,
                    source: 'google_calendar',
                })

            if (!error) synced++
        }

        return Response.json({
            synced,
            totalMatched: matchedEvents.length,
            markedCancelled,
        })

    } catch (err: unknown) {
        console.error('Sync error:', err)
        return Response.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 })
    }
}