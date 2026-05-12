'use client'
// src/components/layout/CommandBar.tsx

import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { useUser } from '@clerk/nextjs'
import { runAppointmentAiAction } from '@/lib/appointment-ai-actions'

const SUGGESTIONS = [
    "Who hasn't paid me?",
    'Show my calendar',
    'Create new invoice',
    'Show overdue',
    'Show active clients',
    'Send reminder to client',
]

interface CommandBarProps {
    isEmpty?: boolean
    greeting?: string
}

export function CommandBar({ isEmpty = false, greeting = '' }: CommandBarProps) {
    const { user } = useUser()
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [aiMessage, setAiMessage] = useState('')
    const [isListening, setIsListening] = useState(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const recRef = useRef<any>(null)
    const stoppedManuallyRef = useRef(false)

    const { setComponents, setFilter, clearFilters, setEmptyMessage, setAppointmentAction, clearAppointmentAction, filters } = useStore()

    async function handleSubmit(prompt: string) {
        const trimmed = prompt.trim()
        if (!trimmed || loading) return

        setLoading(true)
        setInput('')
        setAiMessage('Thinking…')

        try {
            const todayStr = new Date().toISOString().split('T')[0]
            const dayName = new Date().toLocaleString('en-US', { weekday: 'long' })
            const promptWithToday = `[TODAY: ${todayStr}, ${dayName}] ${trimmed}`
            const res = await fetch('/api/ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: promptWithToday, context: { filters } }),
            })

            if (!res.ok) throw new Error(`HTTP ${res.status}`)

            const data = await res.json()

            clearFilters()
            clearAppointmentAction()

            if (data.changeUI) {
                setComponents(data.components ?? ['StatsBar', 'ClientTable'])
                const newFilters: Record<string, string> = data.filters ?? {}
                Object.entries(newFilters).forEach(([key, value]) => {
                    if (value && typeof value === 'string') setFilter(key, value)
                })
                if (data.emptyMessage) setEmptyMessage(data.emptyMessage)
            }

            const APPOINTMENT_ACTIONS = new Set([
                'create_appointment',
                'create_appointments_bulk',
                'cancel_appointment',
                'cancel_appointments_bulk',
            ])
            const isAppointmentMutation =
                Boolean(user?.id && data.action && APPOINTMENT_ACTIONS.has(data.action))

            let exec = null as Awaited<ReturnType<typeof runAppointmentAiAction>>
            if (isAppointmentMutation) {
                exec = await runAppointmentAiAction({
                    userId: user!.id,
                    action: data.action,
                    data: (data.appointmentData ?? {}) as Record<string, unknown>,
                })
                if (exec?.ok && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('freelanceos:appointments'))
                }
            } else if (
                data.appointmentData &&
                typeof data.appointmentData === 'object' &&
                Object.keys(data.appointmentData).length > 0
            ) {
                setAppointmentAction(
                    typeof data.action === 'string' ? data.action : 'none',
                    data.appointmentData as Record<string, string>,
                )
            }

            const base = typeof data.reply === 'string' ? data.reply : 'Done'
            if (exec) {
                setAiMessage(exec.ok ? `${base} ${exec.message}`.trim() : exec.message)
                setTimeout(() => setAiMessage(''), exec.ok ? 3200 : 5000)
            } else {
                setAiMessage(base)
                setTimeout(() => setAiMessage(''), 2500)
            }

        } catch (err) {
            console.error('CommandBar error:', err)
            setAiMessage('Something went wrong, try again')
            setTimeout(() => setAiMessage(''), 2000)
        } finally {
            setLoading(false)
            inputRef.current?.focus()
        }
    }

    async function startVoice() {
        if (isListening) {
            if (recRef.current) {
                try { recRef.current.stop() } catch (_) { }
            }
            setIsListening(false)
            setAiMessage('')
            return
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
            const recorder = new MediaRecorder(stream)
            const chunks: Blob[] = []

            recorder.ondataavailable = e => {
                if (e.data.size > 0) chunks.push(e.data)
            }

            recorder.onstop = async () => {
                stream.getTracks().forEach(t => t.stop())
                if (chunks.length === 0) return

                const blob = new Blob(chunks, { type: 'audio/webm' })
                const form = new FormData()
                form.append('file', blob, 'audio.webm')

                setAiMessage('Transcribing…')
                try {
                    const res = await fetch('/api/transcribe', { method: 'POST', body: form })
                    const { text } = await res.json()
                    if (text?.trim()) {
                        setInput(text)
                        handleSubmit(text)
                    } else {
                        setAiMessage('Could not hear you')
                        setTimeout(() => setAiMessage(''), 2000)
                    }
                } catch {
                    setAiMessage('Transcription failed')
                    setTimeout(() => setAiMessage(''), 2000)
                }
            }

            recorder.start()
            recRef.current = recorder
            setIsListening(true)
            setAiMessage('Listening…')

        } catch {
            setAiMessage('Mic access denied')
            setTimeout(() => setAiMessage(''), 2000)
        }
    }

    // ── When isEmpty: fixed, vertically centered, full-screen overlay ──────────
    // ── When !isEmpty: fixed to bottom as before ───────────────────────────────
    return (
        <div
            className={
                isEmpty
                    ? 'fixed inset-0 z-40 flex flex-col items-center justify-center px-4'
                    : 'fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-xl px-4 z-40'
            }
        >
            {/* Welcome heading — only when centered (isEmpty) */}
            <AnimatePresence>
                {isEmpty && (
                    <motion.div
                        key="welcome"
                        initial={{ opacity: 0, y: -12 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.3 }}
                        className="mb-6 text-center"
                    >
                        {user && (
                            <h1 className="text-2xl font-semibold text-zinc-800 dark:text-zinc-200 mb-1">
                                {greeting}, {user.firstName} 👋
                            </h1>
                        )}
                        <p className="text-sm text-zinc-500 dark:text-zinc-400">
                            What do you want to work on today?
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Constrain width when centered */}
            <div className={isEmpty ? 'w-full max-w-xl' : 'w-full backdrop-blur-md bg-white/30'}>

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

                {/* Input pill */}
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-lg shadow-zinc-200/50 dark:shadow-zinc-900/50 p-2 flex items-center gap-2"
                >
                    {/* Sparkle icon */}
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

                    {/* Mic button */}
                    <button
                        type="button"
                        onClick={startVoice}
                        disabled={loading}
                        title={isListening ? 'Stop listening' : 'Voice command'}
                        className={`hover:cursor-pointer flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all ${isListening
                            ? 'bg-red-500 text-white shadow-md shadow-red-500/40'
                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                            } disabled:opacity-40`}
                    >
                        {isListening ? (
                            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                        ) : (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            </svg>
                        )}
                    </button>

                    {/* Send button */}
                    <AnimatePresence>
                        {input.trim() && !loading && (
                            <motion.button
                                initial={{ opacity: 0, scale: 0.8, width: 0 }}
                                animate={{ opacity: 1, scale: 1, width: 'auto' }}
                                exit={{ opacity: 0, scale: 0.8, width: 0 }}
                                onClick={() => handleSubmit(input)}
                                className="text-xs bg-violet-600 hover:bg-violet-700 text-white px-3 py-1.5 rounded-xl transition-colors overflow-hidden whitespace-nowrap"
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
        </div>
    )
}