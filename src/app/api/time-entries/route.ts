import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const taskId = searchParams.get('taskId')

  let query = supabaseAdmin
    .from('time_entries')
    .select('*, tasks(id, title, project_id, projects(id, title))')
    .eq('user_id', userId)
    .order('started_at', { ascending: false })

  if (taskId) query = query.eq('task_id', taskId)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data: data || [] })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .insert({ ...body, user_id: userId })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()

  // If stopping timer, calculate duration from existing started_at
  if (updates.ended_at && !updates.duration_minutes) {
    // Fetch existing record to get started_at
    const { data: existing } = await supabaseAdmin
      .from('time_entries')
      .select('started_at')
      .eq('id', id)
      .eq('user_id', userId)
      .single()
    
    if (existing?.started_at) {
      const start = new Date(existing.started_at)
      const end = new Date(updates.ended_at)
      updates.duration_minutes = Math.round((end.getTime() - start.getTime()) / 60000)
    }
  }

  const { data, error } = await supabaseAdmin
    .from('time_entries')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}