import { generateText } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { auth } from '@clerk/nextjs/server'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY,
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const field = typeof body.field === 'string' ? body.field : 'business text'
  const context = typeof body.context === 'string' ? body.context.trim() : ''

  if (!process.env.OPENROUTER_API_KEY) {
    return Response.json({ error: 'AI key missing' }, { status: 500 })
  }

  const prompt = `Rewrite this ${field} for a premium freelance business app.

Rules:
- Keep it professional, specific, and serious.
- Preserve all factual details.
- If the input is blank, create a concise useful draft from the context.
- Do not add fake names, prices, dates, or legal claims.
- Return only the improved text.

Context:
${context || 'None'}

Input:
${text || '[blank]'}`

  const result = await generateText({
    model: openrouter('google/gemini-2.0-flash-001'),
    prompt,
    temperature: 0.25,
    maxOutputTokens: 700,
  })

  return Response.json({ text: result.text.trim() })
}
