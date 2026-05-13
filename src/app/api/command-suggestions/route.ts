import { auth } from '@clerk/nextjs/server'
import { supabaseAdmin } from '@/lib/supabase-admin'



/** Lightweight lists for command-bar autocompletes (no secrets). */
export async function GET(req: Request) {
    const { userId } = await auth()
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const qRaw = String(searchParams.get('q') || '').trim()
    const q = qRaw.replace(/[%_\\]/g, ' ').replace(/\s+/g, ' ').trim()
    const limit = 12

    const [projectsRes, clientsRes] = await Promise.all([
        (q
            ? supabaseAdmin.from('projects').select('id, title').eq('user_id', userId).ilike('title', `%${q}%`)
            : supabaseAdmin.from('projects').select('id, title').eq('user_id', userId)
        )
            .order('created_at', { ascending: false })
            .limit(limit),
        (q
            ? supabaseAdmin.from('clients').select('id, name').eq('user_id', userId).ilike('name', `%${q}%`)
            : supabaseAdmin.from('clients').select('id, name').eq('user_id', userId)
        )
            .order('created_at', { ascending: false })
            .limit(limit),
    ])

    if (projectsRes.error) return Response.json({ error: projectsRes.error.message }, { status: 500 })
    if (clientsRes.error) return Response.json({ error: clientsRes.error.message }, { status: 500 })

    return Response.json({
        projects: (projectsRes.data || []).map((p) => ({ id: p.id, title: p.title })),
        clients: (clientsRes.data || []).map((c) => ({ id: c.id, name: c.name })),
    })
}
