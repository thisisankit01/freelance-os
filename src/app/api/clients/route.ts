import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type ClientInput = {
  id?: string
  name?: string
  email?: string | null
  phone?: string | null
  company?: string | null
  city?: string | null
  status?: string | null
  notes?: string | null
  total_billed?: number | string | null
  total_paid?: number | string | null
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function money(value: unknown) {
  if (value === null || value === undefined || value === '') return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function cleanClient(body: ClientInput) {
  return {
    name: text(body.name) ?? '',
    email: text(body.email),
    phone: text(body.phone),
    company: text(body.company),
    city: text(body.city),
    status: body.status === 'inactive' ? 'inactive' : 'active',
    notes: text(body.notes),
    total_billed: money(body.total_billed),
    total_paid: money(body.total_paid),
  }
}

function cleanClientPatch(body: ClientInput) {
  const out: Record<string, unknown> = {}
  if (body.name !== undefined) out.name = text(body.name) ?? ''
  if (body.email !== undefined) out.email = text(body.email)
  if (body.phone !== undefined) out.phone = text(body.phone)
  if (body.company !== undefined) out.company = text(body.company)
  if (body.city !== undefined) out.city = text(body.city)
  if (body.status !== undefined) out.status = body.status === 'inactive' ? 'inactive' : 'active'
  if (body.notes !== undefined) out.notes = text(body.notes)
  if (body.total_billed !== undefined) out.total_billed = money(body.total_billed)
  if (body.total_paid !== undefined) out.total_paid = money(body.total_paid)
  return out
}

async function findDuplicate(userId: string, client: ReturnType<typeof cleanClient>) {
  if (client.email) {
    const { data } = await supabaseAdmin
      .from('clients')
      .select('id')
      .eq('user_id', userId)
      .ilike('email', client.email)
      .maybeSingle()
    if (data?.id) return data.id as string
  }

  const { data } = await supabaseAdmin
    .from('clients')
    .select('id')
    .eq('user_id', userId)
    .ilike('name', client.name)
    .maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export async function GET(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search')
  const status = searchParams.get('status')
  const city = searchParams.get('city')

  let query = supabaseAdmin
    .from('clients')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  if (city) query = query.ilike('city', `%${city}%`)
  if (search) query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)

  const { data, error } = await query
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ data: data ?? [] })
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as ClientInput | { clients?: ClientInput[]; mode?: string }
  const rows = Array.isArray((body as { clients?: ClientInput[] }).clients)
    ? (body as { clients: ClientInput[] }).clients
    : [body as ClientInput]
  const mode = (body as { mode?: string }).mode === 'update_existing' ? 'update_existing' : 'skip_duplicates'

  const created = []
  const updated = []
  const skipped = []

  for (const raw of rows.slice(0, 500)) {
    const client = cleanClient(raw)
    if (!client.name) {
      skipped.push({ ...raw, reason: 'Missing name' })
      continue
    }

    const duplicateId = await findDuplicate(userId, client)
    if (duplicateId && mode === 'skip_duplicates') {
      skipped.push({ ...client, reason: 'Duplicate' })
      continue
    }

    if (duplicateId && mode === 'update_existing') {
      const { data, error } = await supabaseAdmin
        .from('clients')
        .update(client)
        .eq('id', duplicateId)
        .eq('user_id', userId)
        .select()
        .single()
      if (error) skipped.push({ ...client, reason: error.message })
      else updated.push(data)
      continue
    }

    const { data, error } = await supabaseAdmin
      .from('clients')
      .insert({ ...client, user_id: userId })
      .select()
      .single()
    if (error) skipped.push({ ...client, reason: error.message })
    else created.push(data)
  }

  return Response.json({ data: created.length === 1 && rows.length === 1 ? created[0] : created, created, updated, skipped })
}

export async function PATCH(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as ClientInput | { ids?: string[]; updates?: ClientInput }
  const ids = Array.isArray((body as { ids?: string[] }).ids) ? (body as { ids: string[] }).ids.filter(Boolean) : []
  const updates = ids.length ? cleanClientPatch((body as { updates?: ClientInput }).updates ?? {}) : cleanClientPatch(body as ClientInput)
  if (Object.keys(updates).length === 0) return Response.json({ error: 'No updates provided' }, { status: 400 })

  if (ids.length) {
    const { data, error } = await supabaseAdmin
      .from('clients')
      .update(updates)
      .eq('user_id', userId)
      .in('id', ids)
      .select()
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ data: data ?? [] })
  }

  const id = typeof (body as ClientInput).id === 'string' ? (body as ClientInput).id : ''
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const { data, error } = await supabaseAdmin
    .from('clients')
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

  const body = (await req.json().catch(() => ({}))) as { id?: string; ids?: string[] }
  const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : body.id ? [body.id] : []
  if (!ids.length) return Response.json({ error: 'id is required' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('clients')
    .delete()
    .eq('user_id', userId)
    .in('id', ids)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true, deleted: ids.length })
}
