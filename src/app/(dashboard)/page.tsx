'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '@/lib/store'
import { CommandBar } from '@/components/layout/CommandBar'

// Import all possible components
import { StatsBar } from '@/components/registry/StatsBar'
import { ClientTable } from '@/components/registry/ClientTable'
import { ClientCard } from '@/components/registry/ClientCard'
import { InvoiceList } from '@/components/registry/InvoiceList'
import { InvoiceBuilder } from '@/components/registry/InvoiceBuilder'
import { PaymentStatus } from '@/components/registry/PaymentStatus'
import { EmptyState } from '@/components/registry/EmptyState'
import { useUser } from '@clerk/nextjs'

// Registry: name → component mapping
// The AI returns names like "StatsBar" — this map turns names into actual React components
const REGISTRY: Record<string, React.ComponentType> = {
    StatsBar,
    ClientTable,
    ClientCard,
    InvoiceList,
    InvoiceBuilder,
    PaymentStatus,
    EmptyState,
}

export default function Dashboard() {
    const { user } = useUser()
    const [greeting, setGreeting] = useState('')
    const { activeComponents } = useStore()

    useEffect(() => {
        const greetingMessageAccordingToTimeZone = () => {
            const timeNow = new Date().getHours();
            if (timeNow < 12) {
                setGreeting("Good Morning");
            } else if (timeNow < 18) {
                setGreeting("Good Afternoon");
            } else {
                setGreeting("Good Evening");
            }
        }
        greetingMessageAccordingToTimeZone()
    }, [])

    return (
        <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 pb-40">
            <div className="max-w-3xl mx-auto px-4 pt-24">

                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">
                        {greeting} , {user?.firstName}
                    </h1>
                    <p className="text-sm text-zinc-500 mt-0.5">
                        Ask anything or use the command bar below
                    </p>
                </div>

                {/* Contextual components — this is the magic */}

                <AnimatePresence mode="popLayout">
                    {activeComponents.map((name) => {
                        const Component = REGISTRY[name]
                        if (!Component) return null
                        return (
                            <motion.div
                                key={name}
                                // Remove layoutId here — it causes conflicts with AnimatePresence
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

            {/* Command bar — always visible at bottom */}
            <CommandBar />
        </div>
    )
}