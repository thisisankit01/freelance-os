import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const { to, subject, invoiceId, invoiceNumber, pdfBase64 } = await req.json();

  try {
    if (!pdfBase64) throw new Error("No PDF provided");

    const { data, error } = await resend.emails.send({
      from: "FreelanceOS <onboarding@resend.dev>",
      to: [to],
      subject,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #7c3aed;">Invoice from FreelanceOS</h2>
          <p>Please find your invoice attached.</p>
          <p>Invoice: ${invoiceNumber}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #999; font-size: 12px;">Sent via FreelanceOS</p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          content: Buffer.from(pdfBase64, "base64"),
        },
      ],
    });

    if (error) throw error;

    return Response.json({ success: true, id: data?.id });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
