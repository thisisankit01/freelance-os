import { STATIC_COMMANDS, CommandSuggestion } from '../command-registry'

export interface ScoredSuggestion extends CommandSuggestion {
  id: string
  label: string
  category: CommandSuggestion['category']
  icon?: string
  requiresInput?: boolean
  score: number
  source: 'static' | 'ai'
}

function normalize(str: string) {
  return str.toLowerCase().replace(/[^\w\s]/g, '')
}

function calculateScore(query: string, text: string): number {
  const q = normalize(query)
  const t = normalize(text)
  if (!q) return 0

  // Exact prefix match (highest)
  if (t.startsWith(q)) return 5
  // Word boundary match
  const words = t.split(/\s+/)
  if (words.some(w => w.startsWith(q))) return 4
  // Contains substring
  if (t.includes(q)) return 3
  // Fuzzy match (character sequence)
  let qi = 0
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++
  }
  if (qi === q.length) return 2
  return 0
}

export function filterSuggestions(
  query: string,
  aiHints: string[] = []
): ScoredSuggestion[] {
  const q = query.trim()
  
  // Merge static + AI hints
  const candidates: ScoredSuggestion[] = [
    ...STATIC_COMMANDS.map(c => ({
      ...c,
      score: calculateScore(q, c.label),
      source: 'static' as const,
    })),
    ...aiHints.map((h, i) => ({
      id: `ai-${i}`,
      label: h,
      category: 'general' as CommandSuggestion['category'],
      score: calculateScore(q, h),
      source: 'ai' as const,
    })),
  ]

  // If empty query, return curated defaults + a few AI hints
  if (!q) {
    return candidates
      .filter(c => c.source === 'static')
      .slice(0, 6)
  }

  return candidates
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
}