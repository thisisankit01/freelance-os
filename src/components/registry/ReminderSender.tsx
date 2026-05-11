'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useUser } from '@clerk/nextjs'
import { format, parseISO } from 'date-fns'

type Appt = { id: string; title: string; start_time: string; clients?: { id: string; name: string } }

export function ReminderSender() {
    const { user } = useUser()
    const { appointmentData } = useStore()
    const clientName = appointmentData?.clientName || ''

    const [appointments, setAppointments] = useState<Appt[]>([])
    const [loading, setLoading] = useState(true)
    const [sending, setSending] = useState<string | null>(null)
    const [sent, setSent] = useState<Set<string>>(new Set())
    const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null)

    useEffect(() => {
        if (!user?.id) return
        setLoading(true)
        fetch('/api/appointments')
            .then(r => r.json())
            .then(json => {
                let data: Appt[] = json.data || []
                // Filter upcoming only
                data = data.filter(a => new Date(a.start_time) > new Date())
                // Filter by client name if AI provided one
                if (clientName) {
                    const lower = clientName.toLowerCase()
                    data = data.filter(a => a.clients?.name?.toLowerCase().includes(lower) || a.title.toLowerCase().includes(lower))
                }
                setAppointments(data.slice(0, 5))
                setLoading(false)
            })
    }, [user?.id, clientName])

    async function sendReminder(appt: Appt) {
        if (!appt.clients) return
        setSending(appt.id)
        const res = await fetch('/api/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                to: undefined, // We'll look up the email server-side
                subject: `Reminder: ${appt.title} — ${format(parseISO(appt.start_time), 'MMM d, h:mm a')}`,
                invoiceId: appt.id, // reusing the email route for now
            }),
        })
        // Also send via the appointment reminder endpoint
        const res2 = await fetch('/api/appointments/remind', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appointmentId: appt.id }),
        })
        const json = await res2.json()
        setSending(null)
        if (res2.ok) {
            setSent(prev => new Set(prev).add(appt.id))
            setFlash({ msg: `✓ Reminder sent to ${appt.clients?.name}`, ok: true })
        } else {
            setFlash({ msg: json.error || 'Failed to send', ok: false })
        }
        setTimeout(() => setFlash(null), 4000)
    }

    if (loading) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-6">
                <div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse mb-3" />
                <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            </motion.div>
        )
    }

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">📩 Send Reminders</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                    {clientName ? `Appointments with ${clientName}` : 'Upcoming appointments'}
                </p>
            </div>

            <AnimatePresence>
                {flash && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className={`px-5 py-2 text-xs font-medium overflow-hidden ${flash.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                        {flash.msg}
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="p-4">
                {appointments.length === 0 ? (
                    <p className="text-center text-sm text-zinc-400 py-6">
                        {clientName ? `No upcoming appointments with ${clientName}` : 'No upcoming appointments'}
                    </p>
                ) : (
                    <div className="space-y-2">
                        {appointments.map(appt => (
                            <div key={appt.id} className="flex items-center gap-3 p-3 rounded-lg border border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                                <div className="w-1 h-10 rounded-full bg-violet-400 dark:bg-violet-600 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{appt.title}</p>
                                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                        {format(parseISO(appt.start_time), 'MMM d, h:mm a')}
                                        {appt.clients?.name && ` · ${appt.clients.name}`}
                                    </p>
                                </div>
                                <button
                                    onClick={() => sendReminder(appt)}
                                    disabled={sending === appt.id || sent.has(appt.id) || !appt.clients}
                                    className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors flex-shrink-0 disabled:opacity-50 ${
                                        sent.has(appt.id)
                                            ? 'bg-emerald-500 text-white'
                                            : !appt.clients
                                                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                                                : 'bg-violet-600 hover:bg-violet-700 text-white'
                                    }`}>
                                    {sending === appt.id ? 'Sending…' : sent.has(appt.id) ? '✓ Sent' : !appt.clients ? 'No client' : '📩 Remind'}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    )
}
