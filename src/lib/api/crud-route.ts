import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type FieldType = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'json'

export type FieldSpec = {
  type: FieldType
  required?: boolean
  nullable?: boolean
}

export type CrudConfig = {
  table: string
  fields: Record<string, FieldSpec>
  orderBy?: string
  ascending?: boolean
  select?: string
  filters?: Record<string, string>
}

function coerceField(value: unknown, spec: FieldSpec) {
  if (value === undefined) return undefined
  if (value === null || value === '') {
    if (spec.nullable) return null
    return undefined
  }
  if (spec.type === 'string') return String(value).trim()
  if (spec.type === 'number') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  if (spec.type === 'integer') {
    const n = Number(value)
    return Number.isInteger(n) ? n : undefined
  }
  if (spec.type === 'boolean') return Boolean(value)
  if (spec.type === 'date') return String(value)
  if (spec.type === 'json') return value
  return undefined
}

function pickFields(body: Record<string, unknown>, fields: Record<string, FieldSpec>) {
  const out: Record<string, unknown> = {}
  const missing: string[] = []
  for (const [key, spec] of Object.entries(fields)) {
    const coerced = coerceField(body[key], spec)
    if (spec.required && (coerced === undefined || coerced === '')) {
      missing.push(key)
      continue
    }
    if (coerced !== undefined) out[key] = coerced
  }
  return { out, missing }
}

export function createCrudHandlers(config: CrudConfig) {
  async function GET(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const url = new URL(req.url)
    let query = supabaseAdmin
      .from(config.table)
      .select(config.select ?? '*')
      .eq('user_id', userId)
      .order(config.orderBy ?? 'created_at', { ascending: config.ascending ?? false })

    for (const [param, column] of Object.entries(config.filters ?? {})) {
      const value = url.searchParams.get(param)
      if (value) query = query.eq(column, value)
    }

    const { data, error } = await query
    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ data: data || [] })
  }

  async function POST(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const { out, missing } = pickFields(body, config.fields)
    if (missing.length) {
      return Response.json({ error: `${missing.join(', ')} required` }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from(config.table)
      .insert({ ...out, user_id: userId })
      .select(config.select ?? '*')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ data })
  }

  async function PATCH(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const { out, missing } = pickFields(body, config.fields)
    if (missing.some((key) => body[key] !== undefined)) {
      return Response.json({ error: `${missing.join(', ')} invalid` }, { status: 400 })
    }
    if ('updated_at' in config.fields) out.updated_at = new Date().toISOString()

    const { data, error } = await supabaseAdmin
      .from(config.table)
      .update(out)
      .eq('id', id)
      .eq('user_id', userId)
      .select(config.select ?? '*')
      .single()

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ data })
  }

  async function DELETE(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const id = typeof body.id === 'string' ? body.id : ''
    if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

    const { error } = await supabaseAdmin
      .from(config.table)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)

    if (error) return Response.json({ error: error.message }, { status: 500 })
    return Response.json({ success: true })
  }

  return { GET, POST, PATCH, DELETE }
}
