import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { STATIC_COMMANDS, CommandSuggestion } from './command-registry'

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
    dynamic.push({
      id: `dyn-client-${i}`,
      label: `Show client ${c.name}`,
      category: 'client',
      icon: '👥',
      requiresInput: false,
      score: 0,
      source: 'static',
    })
    dynamic.push({
      id: `dyn-schedule-${i}`,
      label: `Schedule call with ${c.name}`,
      category: 'calendar',
      icon: '📅',
      requiresInput: false,
      score: 0,
      source: 'static',
    })
    dynamic.push({
      id: `dyn-invoice-${i}`,
      label: `Create invoice for ${c.name}`,
      category: 'invoice',
      icon: '🧾',
      requiresInput: false,
      score: 0,
      source: 'static',
    })
  })

  entities.projects.slice(0, 6).forEach((p, i) => {
    dynamic.push({
      id: `dyn-tasks-${i}`,
      label: `Show tasks in ${p.title}`,
      category: 'task',
      icon: '✅',
      requiresInput: false,
      score: 0,
      source: 'static',
    })
    dynamic.push({
      id: `dyn-hold-${i}`,
      label: `Put project ${p.title} on hold`,
      category: 'project',
      icon: '📊',
      requiresInput: false,
      score: 0,
      source: 'static',
    })
  })

  return dynamic
}

export function useCommandSuggestions(
  input: string,
  entities: EntityRows = { projects: [], clients: [] }
) {
  const [aiHints, setAiHints] = useState<string[]>([])
  const [aiLoading, setAiLoading] = useState(false)
  const fetchedRef = useRef(false)
  const lastContextRef = useRef<string>('')

  const allSuggestions = useMemo(() => {
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
    const ai = aiHints.map((h, i) => ({
      id: `ai-${i}`,
      label: h,
      category: 'general' as CommandSuggestion['category'],
      icon: undefined as string | undefined,
      requiresInput: undefined as boolean | undefined,
      score: 0,
      source: 'ai' as const,
    }))
    return [...statics, ...dynamics, ...ai]
  }, [entities, aiHints])

  const suggestions = useMemo(() => {
    const q = input.trim()

    if (!q) {
      return allSuggestions
        .map(s => ({ ...s, score: s.source === 'ai' ? 3 : 1 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
    }

    const scored = allSuggestions.map(s => ({
      ...s,
      score: calculateScore(q, s.label),
    })).filter(s => s.score > 0)

    const final = scored.map(s => 
      s.source === 'ai' ? { ...s, score: s.score + 0.5 } : s
    )

    return final
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  }, [input, allSuggestions])

  const refreshHints = useCallback((context?: HintContext) => {
    const contextKey = context 
      ? `${context.workspaceMode}-${context.projects.length}-${context.clients.length}`
      : 'default'

    if (fetchedRef.current && lastContextRef.current === contextKey) return
    lastContextRef.current = contextKey

    setAiLoading(true)
    fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "command_hints",
        ...(context && {
          suggestionContext: {
            workspaceMode: context.workspaceMode,
            projects: context.projects,
            clients: context.clients,
          },
        }),
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data.hints)) {
          setAiHints(data.hints)
          fetchedRef.current = true
        }
      })
      .catch(() => {})
      .finally(() => setAiLoading(false))
  }, [])

  useEffect(() => {
    if (!fetchedRef.current) refreshHints()
  }, [refreshHints])

  return { 
    suggestions, 
    aiLoading, 
    refreshHints,
    hasAiHints: aiHints.length > 0,
  }
}