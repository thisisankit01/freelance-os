import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

function cleanJson(raw: string) {
  return raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
}

function normalizeClient(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const name = typeof row.name === 'string' ? row.name.trim() : ''
  if (!name) return null
  const email = typeof row.email === 'string' ? row.email.trim() : ''
  const phone = typeof row.phone === 'string' ? row.phone.trim() : ''
  const company = typeof row.company === 'string' ? row.company.trim() : ''
  const city = typeof row.city === 'string' ? row.city.trim() : ''
  const notes = typeof row.notes === 'string' ? row.notes.trim() : ''
  const status = row.status === 'inactive' ? 'inactive' : 'active'
  return {
    name,
    email,
    phone,
    company,
    city,
    status,
    notes,
  }
}

function parseFallback(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const email = line.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? ''
      const phone = line.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.trim() ?? ''
      const cleaned = line
        .replace(email, '')
        .replace(phone, '')
        .replace(/[|,;]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return normalizeClient({ name: cleaned || email || phone, email, phone })
    })
    .filter(Boolean)
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string }
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (!text) return Response.json({ data: [] })

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ data: parseFallback(text) })
  }

  try {
    const result = await generateText({
      model: openrouter('google/gemini-2.0-flash-001'),
      temperature: 0.1,
      maxOutputTokens: 1800,
      messages: [
        {
          role: 'system',
          content:
            'Extract client contacts from messy text. Return only JSON: {"clients":[{"name":"","email":"","phone":"","company":"","city":"","status":"active","notes":""}]}. Do not invent data. Keep status active unless text says inactive/past/former.',
        },
        { role: 'user', content: text.slice(0, 12000) },
      ],
    })

    const raw = cleanJson(result.text ?? '')
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) return Response.json({ data: parseFallback(text) })
    const parsed = JSON.parse(match[0]) as { clients?: unknown[] }
    const clients = Array.isArray(parsed.clients)
      ? parsed.clients.map(normalizeClient).filter(Boolean).slice(0, 300)
      : []
    return Response.json({ data: clients })
  } catch {
    return Response.json({ data: parseFallback(text) })
  }
}
