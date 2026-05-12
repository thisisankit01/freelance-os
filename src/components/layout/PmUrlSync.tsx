'use client'

import { Suspense, useEffect, useRef } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { usePmChatStore } from '@/lib/pm-chat-store'

function PmUrlSyncInner({ enabled }: { enabled: boolean }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const taskBoardProjectId = usePmChatStore((s) => s.taskBoardProjectId)
    const setTaskView = usePmChatStore((s) => s.setTaskView)
    /** Last search string we reconciled — avoids re-applying ?pmProject= after store clear (race before router.replace). */
    const lastSearchKeyRef = useRef<string | null>(null)

    useEffect(() => {
        if (!enabled) return
        const key = searchParams.toString()
        const id = searchParams.get('pmProject')
        if (!id) {
            lastSearchKeyRef.current = key
            return
        }
        if (id === taskBoardProjectId) {
            lastSearchKeyRef.current = key
            return
        }
        // Store cleared to "all tasks" but URL still has pmProject until the effect below runs — do not re-hydrate.
        if (taskBoardProjectId === null && key === lastSearchKeyRef.current) {
            return
        }
        lastSearchKeyRef.current = key
        ;(async () => {
            const res = await fetch('/api/projects')
            const json = await res.json()
            const projects = json.data || []
            const p = projects.find((x: { id: string }) => x.id === id)
            if (p) setTaskView(p.id, p.title)
        })()
    }, [enabled, searchParams, taskBoardProjectId, setTaskView])

    useEffect(() => {
        if (!enabled) return
        const current = searchParams.get('pmProject') || ''
        const next = taskBoardProjectId || ''
        if (current === next) return
        const sp = new URLSearchParams(searchParams.toString())
        if (next) sp.set('pmProject', next)
        else sp.delete('pmProject')
        const q = sp.toString()
        const url = q ? `${pathname}?${q}` : pathname
        router.replace(url, { scroll: false })
    }, [enabled, taskBoardProjectId, pathname, router, searchParams])

    return null
}

export function PmUrlSync({ enabled }: { enabled: boolean }) {
    if (!enabled) return null
    return (
        <Suspense fallback={null}>
            <PmUrlSyncInner enabled={enabled} />
        </Suspense>
    )
}
