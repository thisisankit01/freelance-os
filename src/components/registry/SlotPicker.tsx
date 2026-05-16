'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useUser } from '@clerk/nextjs'
import { supabase } from '@/lib/supabase'
import { format, addDays, setHours, setMinutes, isBefore } from 'date-fns'

type Client = { id: string; name: string }

function generateSlots(date: Date): Date[] {
    const slots: Date[] = []
    const now = new Date()
    for (let h = 9; h < 18; h++) {
        const slot = setMinutes(setHours(new Date(date), h), 0)
        if (!isBefore(slot, now)) slots.push(slot)
    }
    return slots
}

export function SlotPicker() {
    const { user } = useUser()
    const { appointmentData } = useStore()
    const [clients, setClients] = useState<Client[]>([])
    const [clientId, setClientId] = useState('')
    const [dayIdx, setDayIdx] = useState(0)
    const [booked, setBooked] = useState<string[]>([])
    const [saving, setSaving] = useState(false)
    const [title, setTitle] = useState('')
    const [flash, setFlash] = useState<{ msg: string; ok: boolean } | null>(null)

    const days = Array.from({ length: 7 }, (_, i) => addDays(new Date(), i + 1))
    const activeDay = days[dayIdx]
    const slots = generateSlots(activeDay)

    useEffect(() => {
        if (!user?.id) return
        supabase.from('clients').select('id, name').eq('user_id', user.id)
            .order('name').then(({ data }) => {
                setClients(data || [])
                if (appointmentData?.clientName && data) {
                    const m = data.find(c => c.name.toLowerCase().includes(appointmentData!.clientName!.toLowerCase()))
                    if (m) setClientId(m.id)
                }
            })
    }, [user?.id, appointmentData?.clientName])

    useEffect(() => {
        if (!user?.id) return
        const s = new Date(activeDay); s.setHours(0, 0, 0, 0)
        const e = new Date(activeDay); e.setHours(23, 59, 59, 999)
        fetch(`/api/appointments?startDate=${s.toISOString()}&endDate=${e.toISOString()}`)
            .then(r => r.json())
                .then(j => setBooked(((j.data || []) as { start_time: string }[]).map((a) => format(new Date(a.start_time), 'HH:mm'))))
    }, [user?.id, dayIdx])

    async function book(slot: Date) {
        if (!clientId) { setFlash({ msg: 'Select a client first', ok: false }); setTimeout(() => setFlash(null), 3000); return }
        setSaving(true)
        const cl = clients.find(c => c.id === clientId)
        const res = await fetch('/api/appointments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'create', clientId, title: title.trim() || `Meeting with ${cl?.name}`, startTime: slot.toISOString() }),
        })
        const j = await res.json(); setSaving(false)
        if (!res.ok) setFlash({ msg: j.error, ok: false })
        else { setFlash({ msg: `✓ Booked ${format(slot, 'MMM d, h:mm a')}`, ok: true }); setBooked(p => [...p, format(slot, 'HH:mm')]); setTitle('') }
        setTimeout(() => setFlash(null), 4000)
    }

    return (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">Pick a Time Slot</p>
                <p className="text-xs text-zinc-400 mt-0.5">Available slots · 9 AM – 6 PM</p>
            </div>
            <AnimatePresence>
                {flash && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className={`px-5 py-2 text-xs font-medium overflow-hidden ${flash.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
                        {flash.msg}
                    </motion.div>
                )}
            </AnimatePresence>
            <div className="p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                    <select value={clientId} onChange={e => setClientId(e.target.value)}
                        className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 outline-none focus:ring-2 focus:ring-violet-500/30">
                        <option value="">— Client —</option>
                        {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <input placeholder="Title (optional)" value={title} onChange={e => setTitle(e.target.value)}
                        className="text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-violet-500/30" />
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {days.map((d, i) => (
                        <button key={i} onClick={() => setDayIdx(i)}
                            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${dayIdx === i ? 'bg-violet-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                            {format(d, 'EEE, MMM d')}
                        </button>
                    ))}
                </div>
                <div className="grid grid-cols-3 gap-2">
                    {slots.length === 0 && <p className="col-span-3 text-center text-xs text-zinc-400 py-4">No slots left today</p>}
                    {slots.map(s => {
                        const k = format(s, 'HH:mm'); const taken = booked.includes(k)
                        return (
                            <button key={k} onClick={() => !taken && book(s)} disabled={taken || saving}
                                className={`py-2.5 rounded-lg text-sm font-medium transition-colors ${taken
                                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                                    : 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800'}`}>
                                {format(s, 'h:mm a')}{taken && <span className="block text-[10px]">booked</span>}
                            </button>
                        )
                    })}
                </div>
            </div>
        </motion.div>
    )
}
