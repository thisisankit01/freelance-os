import { auth, clerkClient } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

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

        // Filter events that match client emails
        const matchedEvents = (events.items || []).filter((event: any) => {
            const attendees = event.attendees || []
            return attendees.some((a: any) => clientEmails.has(a.email?.toLowerCase()))
        })

        // After fetching events, add this logging:
        console.log('Total Google events:', events.items?.length || 0)
        console.log('First few events:', events.items?.slice(0, 3).map((e: any) => ({
            title: e.summary,
            start: e.start?.dateTime || e.start?.date,
            attendees: e.attendees?.map((a: any) => a.email) || []
        })))

        // After matching, add:
        console.log('Your clients:', clients?.map((c: any) => ({ name: c.name, email: c.email })))
        console.log('Matched events:', matchedEvents.map((e: any) => ({
            title: e.summary,
            attendee: e.attendees?.find((a: any) => !a.self)?.email
        })))

        // Store as external appointments
        let synced = 0
        for (const event of matchedEvents) {
            const attendee = event.attendees?.find((a: any) =>
                !a.self && clientEmails.has(a.email?.toLowerCase())
            )
            const clientId = clientEmails.get(attendee?.email?.toLowerCase())

            // Normalise to UTC ISO so dedupe + Supabase timestamptz comparisons are consistent
            const rawStart = event.start.dateTime || event.start.date
            const rawEnd = event.end.dateTime || event.end.date
            const startIso = new Date(rawStart).toISOString()
            const endIso = new Date(rawEnd).toISOString()

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

        return Response.json({ synced, totalMatched: matchedEvents.length })

    } catch (err: any) {
        console.error('Sync error:', err)
        return Response.json({ error: err.message }, { status: 500 })
    }
}