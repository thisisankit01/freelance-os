'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/lib/store'
import { Badge } from '@/components/ui/badge'

export function ClientCard() {
    const { selectedClientId, setComponents } = useStore()
    const [client, setClient] = useState<any>(null)
    const [invoices, setInvoices] = useState<any[]>([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!selectedClientId) return

        async function load() {
            setLoading(true)

            // Fetch client details
            const { data: clientData } = await supabase
                .from('clients')
                .select('*')
                .eq('id', selectedClientId)
                .single()

            // Fetch client's invoices
            const { data: invoiceData } = await supabase
                .from('invoices')
                .select('*')
                .eq('client_id', selectedClientId)
                .order('created_at', { ascending: false })

            setClient(clientData)
            setInvoices(invoiceData || [])
            setLoading(false)
        }

        load()
    }, [selectedClientId])

    if (loading) return <div className="bg-white border rounded-xl p-8 animate-pulse">Loading...</div>
    if (!client) return <div className="bg-white border rounded-xl p-8 text-center text-zinc-500">Client not found</div>

    const pending = client.total_billed - client.total_paid

    return (
        <motion.div
            layoutId="ClientCard"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white border border-zinc-100 rounded-xl overflow-hidden"
        >
            {/* Header */}
            <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <h2 className="text-lg font-semibold text-zinc-800">{client.name}</h2>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>{client.status}</Badge>
                    </div>
                    <p className="text-sm text-zinc-500">{client.company} • {client.city}</p>
                </div>
                <button
                    onClick={() => setComponents(['StatsBar', 'ClientTable'])}
                    className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                    ← Back
                </button>
            </div>

            {/* Contact info */}
            <div className="px-5 py-3 border-b border-zinc-100 grid grid-cols-2 gap-4">
                <div>
                    <p className="text-xs text-zinc-400 mb-0.5">Email</p>
                    <p className="text-sm text-zinc-700">{client.email || '—'}</p>
                </div>
                <div>
                    <p className="text-xs text-zinc-400 mb-0.5">Phone</p>
                    <p className="text-sm text-zinc-700">{client.phone || '—'}</p>
                </div>
            </div>

            {/* Financial summary */}
            <div className="px-5 py-3 border-b border-zinc-100 grid grid-cols-3 gap-4">
                <div>
                    <p className="text-xs text-zinc-400 mb-0.5">Total billed</p>
                    <p className="text-sm font-medium text-zinc-800">₹{client.total_billed.toLocaleString('en-IN')}</p>
                </div>
                <div>
                    <p className="text-xs text-zinc-400 mb-0.5">Total paid</p>
                    <p className="text-sm font-medium text-emerald-600">₹{client.total_paid.toLocaleString('en-IN')}</p>
                </div>
                <div>
                    <p className="text-xs text-zinc-400 mb-0.5">Pending</p>
                    <p className={`text-sm font-medium ${pending > 0 ? 'text-red-500' : 'text-zinc-800'}`}>
                        ₹{pending.toLocaleString('en-IN')}
                    </p>
                </div>
            </div>

            {/* Invoices list */}
            <div className="px-5 py-3">
                <p className="text-sm font-medium text-zinc-700 mb-2">Invoices ({invoices.length})</p>
                {invoices.length === 0 ? (
                    <p className="text-xs text-zinc-400">No invoices yet</p>
                ) : (
                    <div className="space-y-1">
                        {invoices.map((inv) => (
                            <div key={inv.id} className="flex justify-between items-center py-2 border-b border-zinc-50 last:border-0">
                                <div>
                                    <p className="text-sm text-zinc-700">{inv.invoice_number}</p>
                                    <p className="text-xs text-zinc-400">{inv.status}</p>
                                </div>
                                <p className="text-sm font-medium text-zinc-800">₹{inv.total.toLocaleString('en-IN')}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    )
}