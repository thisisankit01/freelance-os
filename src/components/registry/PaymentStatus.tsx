'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

export function PaymentStatus() {
    const [overdue, setOverdue] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        async function load() {
            const { data } = await supabase
                .from('invoices')
                .select('*, clients(name)')
                .eq('status', 'overdue')
                .order('due_date', { ascending: true })

            setOverdue(data || [])
            setLoading(false)
        }

        load()
    }, [])

    if (loading) return <div className="bg-white border rounded-xl p-8 animate-pulse">Loading...</div>

    const totalOverdue = overdue.reduce((sum, inv) => sum + inv.total, 0)

    return (
        <motion.div
            layoutId="PaymentStatus"
            className="bg-white border border-zinc-100 rounded-xl overflow-hidden"
        >
            <div className="px-5 py-3 border-b border-zinc-100 flex justify-between items-center">
                <p className="text-sm font-medium text-zinc-700">Overdue payments</p>
                {overdue.length > 0 && (
                    <p className="text-sm font-semibold text-red-500">₹{totalOverdue.toLocaleString('en-IN')}</p>
                )}
            </div>

            {overdue.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-zinc-400">
                    No overdue payments. Great job!
                </div>
            ) : (
                overdue.map((inv, i) => (
                    <motion.div
                        key={inv.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-center justify-between px-5 py-3 border-b border-zinc-50 last:border-0"
                    >
                        <div>
                            <p className="text-sm font-medium text-zinc-800">{inv.clients?.name}</p>
                            <p className="text-xs text-zinc-500">{inv.invoice_number} • Due {inv.due_date}</p>
                        </div>
                        <p className="text-sm font-medium text-red-500">₹{inv.total.toLocaleString('en-IN')}</p>
                    </motion.div>
                ))
            )}
        </motion.div>
    )
}