'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { CommandBar } from '@/components/layout/CommandBar'

import { StatsBar } from '@/components/registry/StatsBar'
import { ClientTable } from '@/components/registry/ClientTable'
import { ClientCard } from '@/components/registry/ClientCard'
import { InvoiceList } from '@/components/registry/InvoiceList'
import { InvoiceBuilder } from '@/components/registry/InvoiceBuilder'
import { PaymentStatus } from '@/components/registry/PaymentStatus'
import { EmptyState } from '@/components/registry/EmptyState'
import { BookingCalendar } from '@/components/registry/BookingCalendar'
import { AppointmentCard } from '@/components/registry/AppointmentCard'
import { SlotPicker } from '@/components/registry/SlotPicker'
import { ReminderSender } from '@/components/registry/ReminderSender'
import { useUser } from '@clerk/nextjs'
import { ConnectGoogleCalendar } from '@/components/layout/ConnectGoogleCalendar'

const REGISTRY: Record<string, React.ComponentType> = {
    StatsBar,
    ClientTable,
    ClientCard,
    InvoiceList,
    InvoiceBuilder,
    PaymentStatus,
    EmptyState,
    BookingCalendar,
    AppointmentCard,
    SlotPicker,
    ReminderSender,
}

export default function Dashboard() {
    const { user } = useUser()
    const [greeting, setGreeting] = useState('')
    const { activeComponents } = useStore()
    const isEmpty = activeComponents.length === 0

    useEffect(() => {
        const h = new Date().getHours()
        if (h < 12) setGreeting('Good Morning')
        else if (h < 18) setGreeting('Good Afternoon')
        else setGreeting('Good Evening')
    }, [])

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">

            {!isEmpty && (
                <>
                    {/* Top fade — fades content behind the navbar as you scroll up */}
                    <div
                        className="fixed top-0 left-0 right-0 z-30 pointer-events-none"
                        style={{ height: '7rem', background: 'linear-gradient(to bottom, var(--fade-color) 40%, transparent)' }}
                    />

                    {/* Bottom fade — fades content behind the command bar as you scroll down */}
                    <div
                        className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none"
                        style={{ height: '10rem', background: 'linear-gradient(to top, var(--fade-color) 40%, transparent)' }}
                    />

                    <div className="max-w-3xl mx-auto px-4 pt-28 pb-52">
                        <div className="mb-6">
                            {user && (
                                <>
                                    <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">
                                        {greeting}, {user?.firstName} 👋
                                    </h1>
                                    <p className="text-sm text-zinc-500 mt-0.5">
                                        Ask anything or use the command bar below
                                    </p>
                                    <div className="mt-3">
                                        <ConnectGoogleCalendar />
                                    </div>
                                </>
                            )}
                        </div>

                        <AnimatePresence mode="popLayout">
                            {activeComponents.map((name) => {
                                const Component = REGISTRY[name]
                                if (!Component) return null
                                return (
                                    <motion.div
                                        key={name}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, y: -4 }}
                                        transition={{ duration: 0.2 }}
                                        className="mb-4"
                                    >
                                        <Component />
                                    </motion.div>
                                )
                            })}
                        </AnimatePresence>
                    </div>
                </>
            )}

            <CommandBar isEmpty={isEmpty} greeting={greeting} />
        </div>
    )
}