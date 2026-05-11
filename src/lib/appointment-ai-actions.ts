import { format, parseISO } from 'date-fns'
import { supabase } from '@/lib/supabase'

export type AppointmentAiResult = { ok: true; message: string } | { ok: false; message: string }

/** Runs create / cancel / bulk-cancel from the command bar so it does not depend on BookingCalendar mounting. */
export async function runAppointmentAiAction(params: {
    userId: string
    action: string
    data: Record<string, string | undefined>
}): Promise<AppointmentAiResult | null> {
    const { userId, action, data } = params

    if (action === 'create_appointment') {
        let clientId: string | null = null
        if (data.clientName) {
            const { data: found } = await supabase
                .from('clients')
                .select('id')
                .eq('user_id', userId)
                .ilike('name', `%${data.clientName}%`)
                .limit(1)
            clientId = found?.[0]?.id ?? null
            if (!clientId) {
                return { ok: false, message: `Client "${data.clientName}" not found. Add them first.` }
            }
        }
        const dateStr = data.date || format(new Date(), 'yyyy-MM-dd')
        const timeStr = data.time || '09:00'
        const startTime = new Date(`${dateStr}T${timeStr}:00`)
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create',
                clientId,
                title: data.title || `Meeting${data.clientName ? ` with ${data.clientName}` : ''}`,
                startTime: startTime.toISOString(),
                notes: data.notes || null,
            }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Could not create appointment' }
        return { ok: true, message: `Scheduled for ${format(startTime, 'MMM d, h:mm a')}` }
    }

    if (action === 'cancel_appointment' && data.clientName) {
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

    if (action === 'cancel_appointments_bulk' && data.bulkScope) {
        const res = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'cancel_bulk',
                bulkScope: data.bulkScope,
                month: data.month,
                clientName: data.clientName,
            }),
        })
        const json = await res.json()
        if (!res.ok) return { ok: false, message: json.error || 'Bulk cancel failed' }
        if (json.cancelledCount === 0) {
            return {
                ok: false,
                message:
                    'No native meetings matched (already past, not linked to this client, or only Google Calendar events — cancel those in Google).',
            }
        }
        return {
            ok: true,
            message: `Cancelled ${json.cancelledCount} meeting(s). Google events still need Google Calendar.`,
        }
    }

    return null
}
