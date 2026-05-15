import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { STATIC_COMMANDS, CommandSuggestion } from '../command-registry'

export interface ScoredSuggestion {
  id: string
  label: string
  category: CommandSuggestion['category']
  icon?: string
  requiresInput?: boolean
  score: number
  source: 'static' | 'ai'
}

interface EntityRows {
  projects: { id: string; title: string }[]
  clients: { id: string; name: string }[]
}

interface HintContext {
  workspaceMode: boolean
  projects: string[]
  clients: string[]
}

function normalize(str: string) {
  return str.toLowerCase().replace(/[^\w\s]/g, '')
}

function calculateScore(query: string, text: string): number {
  const q = normalize(query)
  const t = normalize(text)
  if (!q) return 0
  if (t === q) return 10
  if (t.startsWith(q)) return 8
  const words = t.split(/\s+/)
  if (words.some(w => w.startsWith(q))) return 6
  if (t.includes(q)) return 4
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi === q.length) return 2
  return 0
}

function generateDynamicSuggestions(entities: EntityRows): ScoredSuggestion[] {
  const dynamic: ScoredSuggestion[] = []

  entities.clients.slice(0, 8).forEach((c, i) => {
    dynamic.push({ id: `dyn-client-${i}`, label: `Show client ${c.name}`, category: 'client', icon: '👥', requiresInput: false, score: 0, source: 'static' })
    dynamic.push({ id: `dyn-schedule-${i}`, label: `Schedule call with ${c.name}`, category: 'calendar', icon: '📅', requiresInput: false, score: 0, source: 'static' })
    dynamic.push({ id: `dyn-invoice-${i}`, label: `Create invoice for ${c.name}`, category: 'invoice', icon: '🧾', requiresInput: false, score: 0, source: 'static' })
  })

  entities.projects.slice(0, 6).forEach((p, i) => {
    dynamic.push({ id: `dyn-tasks-${i}`, label: `Show tasks in ${p.title}`, category: 'task', icon: '✅', requiresInput: false, score: 0, source: 'static' })
    dynamic.push({ id: `dyn-hold-${i}`, label: `Put project ${p.title} on hold`, category: 'project', icon: '📊', requiresInput: false, score: 0, source: 'static' })
    dynamic.push({ id: `dyn-edit-${i}`, label: `Edit project ${p.title}`, category: 'project', icon: '✏️', requiresInput: false, score: 0, source: 'static' })
  })

  return dynamic
}

export function useCommandSuggestions(
  input: string,
  entities: EntityRows = { projects: [], clients: [] },
  context?: HintContext
) {
  // AI hints: keyed by query so we cache per-query results
  const [aiHintCache, setAiHintCache] = useState<Record<string, string[]>>({})
  const [aiLoading, setAiLoading] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // The base (non-AI) pool
  const basePool = useMemo(() => {
    const statics = STATIC_COMMANDS.map((c, i) => ({
      id: `static-${i}`,
      label: c.label,
      category: c.category,
      icon: c.icon,
      requiresInput: c.requiresInput,
      score: 0,
      source: 'static' as const,
    }))
    const dynamics = generateDynamicSuggestions(entities)
    return [...statics, ...dynamics]
  }, [entities])

  // Fetch AI hints for a given query (debounced, abortable)
  const fetchAiHints = useCallback((query: string) => {
    // Cancel any pending debounce
    if (debounceRef.current) clearTimeout(debounceRef.current)

    // Cache hit — no need to fetch
    const cacheKey = query.trim().toLowerCase()
    if (aiHintCache[cacheKey] !== undefined) return

    debounceRef.current = setTimeout(async () => {
      // Cancel previous in-flight request
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      setAiLoading(true)
      try {
        const body: Record<string, unknown> = {
          mode: 'command_hints',
          query: query.trim(),
        }
        if (context) {
          body.suggestionContext = {
            workspaceMode: context.workspaceMode,
            projects: context.projects,
            clients: context.clients,
          }
        }

        const r = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        if (!r.ok) return
        const data = (await r.json()) as { hints?: unknown }
        if (Array.isArray(data.hints)) {
          const hints = data.hints
            .map((h) => String(h).trim())
            .filter((h) => h.length > 0 && h.length < 80)
            .slice(0, 8)
          setAiHintCache(prev => ({ ...prev, [cacheKey]: hints }))
        }
      } catch {
        // AbortError is expected — ignore
      } finally {
        setAiLoading(false)
      }
    }, 300) // 300ms debounce
  }, [aiHintCache, context])

  // Trigger fetch whenever input changes
  useEffect(() => {
    fetchAiHints(input)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [input, fetchAiHints])

  // Also fetch on mount with empty query for initial hints
  useEffect(() => {
    const cacheKey = ''
    if (aiHintCache[cacheKey] !== undefined) return
    fetchAiHints('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Merge AI hints for current query into pool and score
  const suggestions = useMemo(() => {
    const q = input.trim()
    const cacheKey = q.toLowerCase()
    const currentAiHints = aiHintCache[cacheKey] ?? aiHintCache[''] ?? []

    const aiItems: ScoredSuggestion[] = currentAiHints.map((h, i) => ({
      id: `ai-${i}-${cacheKey}`,
      label: h,
      category: 'general' as CommandSuggestion['category'],
      icon: undefined,
      requiresInput: undefined,
      score: 0,
      source: 'ai' as const,
    }))

    const allItems = [...basePool, ...aiItems]

    if (!q) {
      // No query: show AI hints first (they're contextual), then static defaults
      return allItems
        .map(s => ({ ...s, score: s.source === 'ai' ? 3 : 1 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    }

    const scored = allItems
      .map(s => ({ ...s, score: calculateScore(q, s.label) + (s.source === 'ai' ? 0.5 : 0) }))
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return scored
  }, [input, basePool, aiHintCache])

  const hasAiHints = Object.keys(aiHintCache).length > 0

  return { suggestions, aiLoading, hasAiHints }
}