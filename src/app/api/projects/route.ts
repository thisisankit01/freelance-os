import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  let query = supabaseAdmin
    .from('projects')
    .select('*, clients(id, name), tasks(id, status, estimated_hours, actual_hours)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

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
    description: body.description == null || body.description === '' ? null : String(body.description),
    budget: body.budget == null || body.budget === '' ? null : Number(body.budget),
    deadline: body.deadline == null || body.deadline === '' ? null : String(body.deadline),
    client_id: body.client_id == null || body.client_id === '' ? null : String(body.client_id),
    status: typeof body.status === 'string' && body.status.trim() ? body.status.trim() : 'not_started',
  }
  if (!row.title) {
    return Response.json({ error: 'title is required' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin.from('projects').insert(row).select().single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, ...updates } = await req.json()
  if (updates.status === 'done') updates.completed_at = new Date().toISOString()

  const { data, error } = await supabaseAdmin
    .from('projects')
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
  const { error } = await supabaseAdmin
    .from('projects')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}