// src/app/api/email/route.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
    const { to, subject, invoiceId } = await req.json()

    try {
        const { data, error } = await resend.emails.send({
            from: 'FreelanceOS <onboarding@resend.dev>', // Free Resend domain
            to: [to], // Must be array
            subject,
            html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Invoice from FreelanceOS</h2>
          <p>Your invoice is ready. Please find the details below:</p>
          <p>Invoice ID: ${invoiceId}</p>
          <p>Login to your dashboard to download the PDF.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Sent via FreelanceOS</p>
        </div>
      `,
        })

        if (error) throw error

        return Response.json({ success: true, id: data?.id })
    } catch (error: any) {
        return Response.json({ error: error.message }, { status: 500 })
    }
}