'use client'
// src/components/layout/CommandBar.tsx

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'

const SUGGESTIONS = [
    "Who hasn't paid me?",
    'Show all invoices',
    'Create new invoice',
    'Show overdue',
    'Show active clients',
]

export function CommandBar() {
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [aiMessage, setAiMessage] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)

    const { setComponents, setFilter, clearFilters, setEmptyMessage, filters } = useStore()

    async function handleSubmit(prompt: string) {
        const trimmed = prompt.trim()
        if (!trimmed || loading) return

        setLoading(true)
        setInput('')
        setAiMessage('Thinking…')

        try {
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: trimmed, context: { filters } }),
            })

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data = await res.json()

            // 1. Clear old state first — no bleed between queries
            clearFilters()

            // 2. If UI should change, update components and filters
            if (data.changeUI) {
                setComponents(data.components ?? ['StatsBar', 'ClientTable'])
                const newFilters: Record<string, string> = data.filters ?? {}
                Object.entries(newFilters).forEach(([key, value]) => {
                    if (value && typeof value === 'string') setFilter(key, value)
                })
                if (data.emptyMessage) setEmptyMessage(data.emptyMessage)
            }

            // 3. Show AI reply
            setAiMessage(data.reply ?? 'Done')
            setTimeout(() => setAiMessage(''), 2500)

        } catch (err) {
            console.error('CommandBar error:', err)
            setAiMessage('Something went wrong, try again')
            setTimeout(() => setAiMessage(''), 2000)
        } finally {
            setLoading(false)
            inputRef.current?.focus()
        }
    }

    return (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-50">

            {/* AI status pill */}
            <AnimatePresence>
                {aiMessage && (
                    <motion.div
                        key="ai-msg"
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 2 }}
                        transition={{ duration: 0.15 }}
                        className="mb-2 text-center"
                    >
                        <span className="text-xs px-3 py-1 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400 border border-violet-100 dark:border-violet-800">
                            {aiMessage}
                        </span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Input */}
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 p-2 flex items-center gap-2"
            >
                <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                    {loading ? (
                        <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <circle cx="7" cy="7" r="2.5" fill="white" />
                            <path d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12"
                                stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    )}
                </div>

                <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                        if (e.key === 'Enter') handleSubmit(input)
                        if (e.key === 'Escape') setInput('')
                    }}
                    placeholder="Ask anything… 'NYC clients' · 'create invoice' · 'who owes me?'"
                    disabled={loading}
                    className="flex-1 text-sm bg-transparent outline-none text-zinc-700 dark:text-zinc-300 placeholder:text-zinc-400 disabled:opacity-50"
                />

                <AnimatePresence>
                    {input.trim() && !loading && (
                        <motion.button
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            onClick={() => handleSubmit(input)}
                            className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl transition-colors"
                        >
                            Go ↗
                        </motion.button>
                    )}
                </AnimatePresence>
            </motion.div>

            {/* Suggestion chips */}
            <AnimatePresence>
                {!input && !loading && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex gap-1.5 mt-2 flex-wrap justify-center"
                    >
                        {SUGGESTIONS.map(s => (
                            <button
                                key={s}
                                onClick={() => handleSubmit(s)}
                                className="text-xs px-2.5 py-1 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:border-zinc-300 transition-all"
                            >
                                {s}
                            </button>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    )
}