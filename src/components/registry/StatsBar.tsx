'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'

export function StatsBar() {
    const [stats, setStats] = useState({
        totalEarned: 0,
        pending: 0,
        overdue: 0,
        activeClients: 0,
    })

    useEffect(() => {
        async function load() {
            // Fetch invoices for money stats
            const { data: invoices } = await supabase
                .from('invoices')
                .select('status, total')

            // Fetch clients for count
            const { data: clients } = await supabase
                .from('clients')
                .select('id, status')

            if (!invoices || !clients) return

            setStats({
                totalEarned: invoices
                    .filter(i => i.status === 'paid')
                    .reduce((sum, i) => sum + (i.total || 0), 0),
                pending: invoices
                    .filter(i => i.status === 'sent')
                    .reduce((sum, i) => sum + (i.total || 0), 0),
                overdue: invoices
                    .filter(i => i.status === 'overdue')
                    .reduce((sum, i) => sum + (i.total || 0), 0),
                activeClients: clients.filter(c => c.status === 'active').length,
            })
        }

        load()
    }, []) // Empty array = run once on mount

    const cards = [
        { label: 'Total earned', value: `₹${stats.totalEarned.toLocaleString('en-IN')}`, color: 'text-emerald-600' },
        { label: 'Pending', value: `₹${stats.pending.toLocaleString('en-IN')}`, color: 'text-amber-600' },
        { label: 'Overdue', value: `₹${stats.overdue.toLocaleString('en-IN')}`, color: 'text-red-500' },
        { label: 'Active clients', value: stats.activeClients.toString(), color: 'text-blue-600' },
    ]

    return (
        <motion.div
            layoutId="StatsBar"
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"
        >
            {cards.map((c, i) => (
                <motion.div
                    key={c.label}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white border border-zinc-100 rounded-xl p-4"
                >
                    <p className="text-xs text-zinc-500 mb-1">{c.label}</p>
                    <p className={`text-xl font-semibold ${c.color}`}>{c.value}</p>
                </motion.div>
            ))}
        </motion.div>
    )
}