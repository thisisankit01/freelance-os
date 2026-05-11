'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useUser } from '@clerk/nextjs'
import { format, parseISO } from 'date-fns'

type AppointmentDetail = {
    id: string
    title: string
    start_time: string
    end_time: string
    status: string
    notes?: string
    clients?: { id: string; name: string }
}

const STATUS_BADGE: Record<string, string> = {
    scheduled: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
    completed: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
    cancelled: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400',
}

export function AppointmentCard() {
    const { user } = useUser()
    const { appointmentData, filters } = useStore()
    const [appointments, setAppointments] = useState<AppointmentDetail[]>([])
    const [loading, setLoading] = useState(true)

    const searchName = appointmentData?.clientName || filters.search || ''

    useEffect(() => {
        if (!user?.id) return
        setLoading(true)

        async function load() {
            const params = new URLSearchParams()
            // Fetch broadly, filter client-side by name
            const res = await fetch(`/api/appointments?${params}`)
            const json = await res.json()
            let data: AppointmentDetail[] = json.data || []

            // Filter by client name if provided
            if (searchName) {
                const lower = searchName.toLowerCase()
                data = data.filter(a =>
                    a.clients?.name?.toLowerCase().includes(lower) ||
                    a.title.toLowerCase().includes(lower)
                )
            }

            data = data.filter((a) => (a.status || '').toLowerCase() !== 'cancelled')

            setAppointments(data)
            setLoading(false)
        }
        load()
    }, [user?.id, searchName])

    if (loading) {
        return (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-6 space-y-3">
                <div className="h-4 w-40 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-64 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                <div className="h-3 w-48 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
            </motion.div>
        )
    }

    if (appointments.length === 0) {
        return (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-8 text-center">
                <div className="text-3xl mb-3">📭</div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {searchName ? `No appointments with "${searchName}"` : 'No appointments found'}
                </p>
                <p className="text-xs text-zinc-400 mt-1">Try scheduling one first</p>
            </motion.div>
        )
    }

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3">
            {appointments.map(appt => (
                <div key={appt.id}
                    className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl p-5 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{appt.title}</h3>
                            {appt.clients?.name && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                                    with {appt.clients.name}
                                </p>
                            )}
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${STATUS_BADGE[appt.status] || STATUS_BADGE.scheduled}`}>
                            {appt.status}
                        </span>
                    </div>

                    {/* Details grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">Date</p>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {format(parseISO(appt.start_time), 'EEEE, MMM d')}
                            </p>
                        </div>
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-3">
                            <p className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-wide mb-1">Time</p>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                {format(parseISO(appt.start_time), 'h:mm a')} – {format(parseISO(appt.end_time), 'h:mm a')}
                            </p>
                        </div>
                    </div>

                    {appt.notes && (
                        <div className="bg-violet-50 dark:bg-violet-900/10 rounded-lg p-3">
                            <p className="text-[11px] text-violet-500 dark:text-violet-400 font-medium uppercase tracking-wide mb-1">Notes</p>
                            <p className="text-sm text-zinc-700 dark:text-zinc-300">{appt.notes}</p>
                        </div>
                    )}
                </div>
            ))}
        </motion.div>
    )
}
