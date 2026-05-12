import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('tasks')
    .select('*, projects(id, title)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (projectId) query = query.eq('project_id', projectId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data: data || [] })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const row = {
    user_id: userId,
    title: typeof body.title === 'string' ? body.title.trim() : '',
    project_id: body.project_id == null || body.project_id === '' ? null : String(body.project_id),
    status: typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'todo',
    estimated_hours:
      body.estimated_hours == null || body.estimated_hours === '' ? null : Number(body.estimated_hours),
    due_date: body.due_date == null || body.due_date === '' ? null : String(body.due_date),
  }
  if (!row.title) return Response.json({ error: 'title is required' }, { status: 400 })
  if (!row.project_id) return Response.json({ error: 'project_id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin.from('tasks').insert(row).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  const { data, error } = await supabaseAdmin
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function DELETE(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin.from('tasks').delete().eq('id', id).eq('user_id', userId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}