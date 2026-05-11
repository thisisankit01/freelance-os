import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: Request) {
    try {
        const form = await req.formData()
        const file = form.get('file') as File

        const result = await groq.audio.transcriptions.create({
            model: 'whisper-large-v3-turbo', // free, faster than OpenAI's whisper-1
            file,
        })
        return Response.json({ text: result.text })
    } catch (err) {
        console.error('Transcribe error:', err)
        return Response.json({ error: String(err) }, { status: 500 })
    }
}