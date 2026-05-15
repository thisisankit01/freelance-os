import { create } from 'zustand'

interface TimeEntry {
  id: string
  started_at: string
  ended_at: string | null
  duration_minutes: number | null
  tasks?: { id: string; title: string }
  billable: boolean
}

interface TimerStore {
  activeEntry: TimeEntry | null
  elapsed: number
  isRunning: boolean
  intervalId: NodeJS.Timeout | null
  setActiveEntry: (entry: TimeEntry | null) => void
  startTimer: (entry: TimeEntry) => void
  stopTimer: () => void
  tick: () => void
  syncWithServer: () => Promise<void>
}

export const useTimerStore = create<TimerStore>((set, get) => ({
  activeEntry: null,
  elapsed: 0,
  isRunning: false,
  intervalId: null,

  setActiveEntry: (entry) => {
    const state = get()
    if (state.intervalId) clearInterval(state.intervalId)

    if (entry && !entry.ended_at) {
      const start = new Date(entry.started_at).getTime()
      const elapsed = Math.floor((Date.now() - start) / 1000)
      const intervalId = setInterval(() => get().tick(), 1000)
      set({ activeEntry: entry, elapsed, isRunning: true, intervalId })
    } else {
      set({ activeEntry: null, elapsed: 0, isRunning: false, intervalId: null })
    }
  },

  startTimer: (entry) => {
    const state = get()
    if (state.intervalId) clearInterval(state.intervalId)
    const start = new Date(entry.started_at).getTime()
    const elapsed = Math.floor((Date.now() - start) / 1000)
    const intervalId = setInterval(() => get().tick(), 1000)
    set({ activeEntry: entry, elapsed, isRunning: true, intervalId })
  },

  stopTimer: () => {
    const state = get()
    if (state.intervalId) clearInterval(state.intervalId)
    set({ activeEntry: null, elapsed: 0, isRunning: false, intervalId: null })
  },

  tick: () => {
    const state = get()
    if (state.activeEntry) {
      const start = new Date(state.activeEntry.started_at).getTime()
      set({ elapsed: Math.floor((Date.now() - start) / 1000) })
    }
  },

  syncWithServer: async () => {
    try {
      const res = await fetch('/api/time-entries')
      const json = await res.json()
      const active = json.data?.find((e: TimeEntry) => !e.ended_at)
      if (active) get().setActiveEntry(active)
      else get().stopTimer()
    } catch (err) {
      console.error('Timer sync failed:', err)
    }
  },
}))