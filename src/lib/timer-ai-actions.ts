// Client-side helper to start/stop timers from AI actions
import { supabase } from '@/lib/supabase'

export async function startTimerViaAi(params: { taskId?: string; taskName?: string }) {
  const { taskId, taskName } = params
  try {
    if (taskId) {
      const res = await fetch('/api/time-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: taskId, started_at: new Date().toISOString() }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return { ok: false, message: json.error || 'Could not start timer' }
      return { ok: true, message: `Started timer for task` }
    }

    // No taskId — create a generic time entry using supabase directly
    const { data, error } = await supabase
      .from('time_entries')
      .insert({ started_at: new Date().toISOString() })
      .select()
      .single()

    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Started timer' }
  } catch (err: unknown) {
    return { ok: false, message: (err as Error).message || 'Failed to start timer' }
  }
}

export async function stopTimerViaAi() {
  try {
    const r = await fetch('/api/time-entries')
    const j = await r.json()
    const active = Array.isArray(j.data)
      ? j.data.find((e: Record<string, unknown>) => (e as { ended_at?: unknown }).ended_at == null)
      : undefined
    if (!active) return { ok: false, message: 'No running timer' }

    const res = await fetch('/api/time-entries', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: active.id, ended_at: new Date().toISOString() }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: json.error || 'Could not stop timer' }
    return { ok: true, message: 'Stopped timer' }
  } catch (err: unknown) {
    return { ok: false, message: (err as Error).message || 'Failed to stop timer' }
  }
}
