import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

export type AppointmentAiResult = { ok: true; message: string } | { ok: false; message: string }

type MeetingSlot = {
    clientName?: string
    date: string
    time: string
    title?: string
    notes?: string
}

/** Runs create / cancel / bulk from the command bar so it does not depend on BookingCalendar mounting. */
export async function runAppointmentAiAction(params: {
    userId: string
    action: string
    data: Record<string, unknown>
}): Promise<AppointmentAiResult | null> {
    const { userId, action, data } = params

    if (action === 'create_appointment') {
        let clientId: string | null = null
        const clientName = typeof data.clientName === 'string' ? data.clientName : undefined
        if (clientName) {
            const { data: found } = await supabase
                .from('clients')
                .select('id')
                .eq('user_id', userId)
                .ilike('name', `%${clientName}%`)
                .limit(1)
            clientId = found?.[0]?.id ?? null
            if (!clientId) {
                return { ok: false, message: `Client "${clientName}" not found. Add them first.` }
            }
        }
        const dateStr = (typeof data.date === 'string' && data.date) || format(new Date(), 'yyyy-MM-dd')
        const timeStr = (typeof data.time === 'string' && data.time) || '09:00'
        const startTime = new Date(`${dateStr}T${timeStr}:00`)
        const title =
            (typeof data.title === 'string' && data.title) ||
            `Meeting${clientName ? ` with ${clientName}` : ''}`
        const notes = typeof data.notes === 'string' ? data.notes : null
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create',
                clientId,
                title,
                startTime: startTime.toISOString(),
                notes,
            }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Could not create appointment' }
        return { ok: true, message: `Scheduled for ${format(startTime, 'MMM d, h:mm a')}` }
    }

    if (action === 'create_appointments_bulk') {
        const meetingsJson = typeof data.meetingsJson === 'string' ? data.meetingsJson : null
        if (!meetingsJson?.trim()) {
            return { ok: false, message: 'No meeting list — say each client, date, and time.' }
        }
        let slots: MeetingSlot[]
        try {
            slots = JSON.parse(meetingsJson) as MeetingSlot[]
        } catch {
            return { ok: false, message: 'Could not read meeting list.' }
        }
        if (!Array.isArray(slots) || slots.length === 0) {
            return { ok: false, message: 'No valid meetings in the list.' }
        }

        const meetings = slots
            .filter((s) => s && typeof s.date === 'string' && typeof s.time === 'string')
            .map((s) => {
                const startTime = new Date(`${s.date}T${s.time}:00`)
                return {
                    clientName: typeof s.clientName === 'string' ? s.clientName : undefined,
                    title:
                        (typeof s.title === 'string' && s.title) ||
                        (s.clientName ? `Meeting with ${s.clientName}` : 'Meeting'),
                    startTime: startTime.toISOString(),
                    notes: typeof s.notes === 'string' ? s.notes : undefined,
                }
            })

        if (meetings.length === 0) {
            return { ok: false, message: 'Each meeting needs a date and time (YYYY-MM-DD and HH:mm).' }
        }

        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create_bulk', meetings }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Bulk create failed' }
        return {
            ok: true,
            message: `Created ${json.createdCount} meeting(s).`,
        }
    }

    if (action === 'cancel_appointment' && typeof data.clientName === 'string' && data.clientName) {
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel_by_client', clientName: data.clientName }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Could not cancel' }
        return {
            ok: true,
            message: `Cancelled meeting on ${format(parseISO(json.cancelled.start_time), 'MMM d')}`,
        }
    }

    if (action === 'cancel_appointments_bulk' && typeof data.bulkScope === 'string') {
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'cancel_bulk',
                bulkScope: data.bulkScope,
                month: typeof data.month === 'string' ? data.month : undefined,
                date: typeof data.date === 'string' ? data.date : undefined,
                clientName: typeof data.clientName === 'string' ? data.clientName : undefined,
            }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Bulk cancel failed' }
        if (json.cancelledCount === 0) {
            return {
                ok: false,
                message:
                    'No SoloOS-native meetings matched (past, wrong client, or only Google-linked events). Sync calendar to refresh Google copies.',
            }
        }
        return {
            ok: true,
            message: `Cancelled ${json.cancelledCount} SoloOS meeting(s).`,
        }
    }

    return null
}
