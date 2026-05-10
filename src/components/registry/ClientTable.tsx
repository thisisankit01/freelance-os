'use client'
// src/components/registry/ClientTable.tsx

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'
import { useStore } from '@/lib/store'
import { Client } from '@/types'
import { Badge } from '@/components/ui/badge'
import { useUser } from '@clerk/nextjs'

export function ClientTable() {
    const { user } = useUser()
    const userId = user?.id // This is the Clerk user ID
    const [clients, setClients] = useState<Client[]>([])
    const [loading, setLoading] = useState(true)
    const { filters, emptyMessage, selectClient, setComponents } = useStore()

    useEffect(() => {
        if (!userId) return
        async function load() {
            setLoading(true)
            let query = supabase
                .from('clients')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })

            // Apply every filter the AI returned — no hardcoding
            if (filters.status) query = query.eq('status', filters.status)
            if (filters.city) query = query.ilike('city', `%${filters.city}%`)
            if (filters.search) query = query.ilike('name', `%${filters.search}%`)

            const { data, error } = await query

            if (error) console.error('ClientTable fetch error:', error.message)
            setClients(data || [])
            setLoading(false)
        }
        load()
    }, [filters, userId]) // re-runs every time filters change

    function openClient(id: string) {
        selectClient(id)
        setComponents(['StatsBar', 'ClientCard'])
    }

    // ── Build a human-readable label for what's currently being shown ──────────
    function getFilterLabel() {
        const parts: string[] = []
        if (filters.status) parts.push(filters.status)
        if (filters.city) parts.push(`in ${filters.city}`)
        if (filters.search) parts.push(`matching "${filters.search}"`)
        return parts.length > 0 ? `clients ${parts.join(' ')}` : 'clients'
    }

    const filterLabel = getFilterLabel()

    return (
        <motion.div
            layout
            className="bg-white dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden"
        >
            {/* Header — always shows count */}
            <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {loading ? (
                        <span className="text-zinc-400">Loading…</span>
                    ) : (
                        <span>
                            <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                                {clients.length}
                            </span>{' '}
                            {filterLabel}
                        </span>
                    )}
                </p>

                {/* Show active filters as pills so user knows what's applied */}
                {!loading && (filters.city || filters.status || filters.search) && (
                    <div className="flex gap-1.5">
                        {filters.city && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                                📍 {filters.city}
                            </span>
                        )}
                        {filters.status && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                {filters.status}
                            </span>
                        )}
                        {filters.search && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                🔍 {filters.search}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Skeleton loader */}
            {loading && (
                <div>
                    {[1, 2, 3].map(i => (
                        <div
                            key={i}
                            className="flex items-center gap-3 px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/50 last:border-0"
                        >
                            <div className="w-8 h-8 rounded-full bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                            <div className="flex-1 space-y-1.5">
                                <div className="h-3 w-28 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                                <div className="h-2.5 w-20 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                            </div>
                            <div className="h-3 w-16 bg-zinc-100 dark:bg-zinc-800 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state — shows when loaded but 0 results */}
            {!loading && clients.length === 0 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="px-6 py-10 flex flex-col items-center text-center gap-3"
                >
                    <div className="w-12 h-12 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center text-2xl">
                        🔍
                    </div>
                    <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                            {/* Use AI-provided emptyMessage, or generate one from the filter */}
                            {emptyMessage ||
                                (filters.city
                                    ? `No clients found in ${filters.city}`
                                    : filters.search
                                        ? `No clients found matching "${filters.search}"`
                                        : filters.status
                                            ? `No ${filters.status} clients`
                                            : 'No clients yet')}
                        </p>
                        <p className="text-xs text-zinc-400 mt-1">
                            {filters.city || filters.search || filters.status
                                ? 'Try a different search, or add a new client'
                                : 'Type "add client" in the command bar to get started'}
                        </p>
                    </div>
                </motion.div>
            )}

            {/* Client rows */}
            <AnimatePresence>
                {!loading && clients.map((client, i) => (
                    <motion.div
                        key={client.id}
                        layoutId={`client-row-${client.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => openClient(client.id)}
                        className="flex items-center justify-between px-4 py-3 border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer last:border-0 transition-colors"
                    >
                        <div className="flex items-center gap-3">
                            {/* Avatar */}
                            <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-xs font-medium text-violet-700 dark:text-violet-300 flex-shrink-0">
                                {client.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                    {client.name}
                                </p>
                                <p className="text-xs text-zinc-500">
                                    {client.city ? `${client.city}` : ''}{client.city && client.email ? ' · ' : ''}{client.email || ''}
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <div className="text-right">
                                <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                                    ₹{(client.total_billed - client.total_paid).toLocaleString('en-IN')}
                                </p>
                                <p className="text-xs text-zinc-400">pending</p>
                            </div>
                            <Badge
                                variant={client.status === 'active' ? 'default' : 'secondary'}
                                className="text-xs"
                            >
                                {client.status}
                            </Badge>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </motion.div>
    )
}