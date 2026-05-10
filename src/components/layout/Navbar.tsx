'use client'

import { motion } from 'framer-motion'
import { UserButton, useUser } from '@clerk/nextjs'

export function Navbar() {
    const { user } = useUser()

    return (
        <motion.header
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-3xl"
        >
            <div className="
                flex items-center justify-between
                px-4 py-2.5
                bg-white/80 dark:bg-zinc-900/80
                backdrop-blur-md
                border border-zinc-200/60 dark:border-zinc-700/60
                rounded-2xl
                shadow-sm shadow-zinc-200/50 dark:shadow-zinc-900/50
            ">
                {/* Brand */}
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0">
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                            <circle cx="7" cy="7" r="2.5" fill="white" />
                            <path d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12"
                                stroke="white" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                    </div>
                    <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 tracking-tight">
                        FreelanceOS
                    </span>
                </div>

                {/* Right side */}
                <div className="flex items-center gap-3">

                    {/* Clerk UserButton — has avatar + logout built in */}
                    <UserButton
                        appearance={{
                            elements: {
                                avatarBox: 'w-7 h-7 rounded-xl',
                                userButtonPopoverCard: 'rounded-2xl shadow-xl border border-zinc-200 dark:border-zinc-700',
                            },
                        }}
                    />
                </div>
            </div>
        </motion.header>
    )
}
