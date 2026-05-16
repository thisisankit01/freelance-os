import { supabaseAdmin } from '@/lib/supabase-admin'
import { auth } from '@clerk/nextjs/server'
import { Resend } from 'resend'
import { getClerkUserEmail, SOLOOS_FROM_EMAIL, uniqueRecipients } from '@/lib/email-delivery'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { appointmentId } = await req.json()
    if (!appointmentId) return Response.json({ error: 'appointmentId required' }, { status: 400 })

    // Fetch appointment + client
    const { data: appt } = await supabaseAdmin
        .from('appointments')
        .select('*, clients(name, email)')
        .eq('id', appointmentId)
        .eq('user_id', userId)
        .single()

    if (!appt) return Response.json({ error: 'Appointment not found' }, { status: 404 })
    if (!appt.clients?.email) return Response.json({ error: 'Client has no email' }, { status: 400 })

    const start = new Date(appt.start_time)
    const dateStr = start.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const timeStr = start.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    const userEmail = await getClerkUserEmail(userId)
    const recipients = uniqueRecipients(appt.clients.email, userEmail)

    try {
        await resend.emails.send({
            from: SOLOOS_FROM_EMAIL,
            to: recipients,
            subject: `⏰ Reminder: ${appt.title} — ${dateStr}`,
            html: `
                <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #7c3aed;">Upcoming Meeting Reminder</h2>
                    <p style="color: #555;">This is a friendly reminder about your upcoming meeting:</p>
                    <div style="background: #f9fafb; border-radius: 12px; padding: 16px; margin: 16px 0;">
                        <p style="margin: 4px 0; font-weight: 600;">${appt.title}</p>
                        <p style="margin: 4px 0; color: #666;">📅 ${dateStr}</p>
                        <p style="margin: 4px 0; color: #666;">🕐 ${timeStr}</p>
                        ${appt.notes ? `<p style="margin: 8px 0 4px; color: #888; font-size: 13px;">📝 ${appt.notes}</p>` : ''}
                    </div>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">Sent via SoloOS</p>
                </div>
            `,
        })
        return Response.json({ success: true })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        return Response.json({ error: err.message }, { status: 500 })
    }
}
