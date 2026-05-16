import { auth } from '@clerk/nextjs/server'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase-admin'
import React from 'react'
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { getClerkUserEmail, SOLOOS_FROM_EMAIL, uniqueRecipients } from '@/lib/email-delivery'

const resend = new Resend(process.env.RESEND_API_KEY)

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function asParagraphs(content: string) {
  return escapeHtml(content)
    .split(/\n{2,}/)
    .map((block) => `<p style="white-space:pre-wrap;margin:0 0 14px;">${block}</p>`)
    .join('')
}

const pdfStyles = StyleSheet.create({
  page: { padding: 44, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.55, color: '#18181b' },
  header: { borderBottom: '1 solid #e5e7eb', paddingBottom: 14, marginBottom: 20 },
  brand: { color: '#7c3aed', fontSize: 10, marginBottom: 8 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: '#111827' },
  meta: { fontSize: 9, color: '#71717a', marginTop: 4 },
  paragraph: { marginBottom: 10 },
  footer: { position: 'absolute', bottom: 28, left: 44, right: 44, borderTop: '1 solid #e5e7eb', paddingTop: 8, fontSize: 8, color: '#71717a' },
})

async function createDocumentPdf(params: { title: string; label: string; recipient: string; content: string }) {
  const paragraphs = params.content.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const element = React.createElement(
    Document,
    { title: params.title },
    React.createElement(
      Page,
      { size: 'A4', style: pdfStyles.page },
      React.createElement(
        View,
        { style: pdfStyles.header },
        React.createElement(Text, { style: pdfStyles.brand }, 'SoloOS'),
        React.createElement(Text, { style: pdfStyles.title }, params.title),
        React.createElement(Text, { style: pdfStyles.meta }, `${params.label} · ${params.recipient}`),
      ),
      ...paragraphs.map((paragraph, index) =>
        React.createElement(Text, { key: index, style: pdfStyles.paragraph }, paragraph),
      ),
      React.createElement(Text, { style: pdfStyles.footer }, 'Generated and sent via SoloOS. Review all legal and commercial terms before relying on this document.'),
    ),
  )
  return renderToBuffer(element)
}

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const { data: doc, error } = await supabaseAdmin
    .from('ai_documents')
    .select('*, clients(id, name, email), projects(id, title, client_id), invoices(id, invoice_number, client_id)')
    .eq('id', id)
    .eq('user_id', userId)
    .single()

  if (error || !doc) {
    return Response.json({ error: error?.message || 'Document not found' }, { status: 404 })
  }

  if (doc.project_id && doc.client_id && doc.projects?.client_id && doc.projects.client_id !== doc.client_id) {
    return Response.json({ error: 'Document client does not match the assigned project client' }, { status: 409 })
  }

  if (doc.invoice_id && doc.client_id && doc.invoices?.client_id && doc.invoices.client_id !== doc.client_id) {
    return Response.json({ error: 'Document client does not match the invoice client' }, { status: 409 })
  }

  const recipient = String(doc.recipient_email || doc.clients?.email || '').trim()
  if (!recipient) {
    return Response.json({ error: 'Recipient email is missing' }, { status: 400 })
  }
  const userEmail = await getClerkUserEmail(userId)
  const recipients = uniqueRecipients(recipient, userEmail)

  const title = String(doc.title || 'Document')
  const label = doc.document_type === 'legal_notice' ? 'Legal notice' : 'Contract'

  const pdfBuffer = await createDocumentPdf({
    title,
    label,
    recipient,
    content: String(doc.content || ''),
  })

  const summary =
    doc.document_type === 'legal_notice'
      ? `Please find attached a legal notice regarding the outstanding payment. The attached PDF contains the full details and should be reviewed carefully.`
      : `Please find attached the contract document for review. The attached PDF contains the project terms, scope, and commercial details.`

  const { data, error: sendError } = await resend.emails.send({
    from: SOLOOS_FROM_EMAIL,
    to: recipients,
    subject: `${label}: ${title}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;color:#18181b;line-height:1.55;">
        <h2 style="margin:0 0 16px;color:#111827;">${escapeHtml(title)}</h2>
        ${asParagraphs(summary)}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
        <p style="font-size:12px;color:#71717a;">The full document is attached as a PDF. Sent via SoloOS.</p>
      </div>
    `,
    attachments: [
      {
        filename: `${title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-|-$/g, '') || 'document'}.pdf`,
        content: pdfBuffer,
      },
    ],
  })

  if (sendError) {
    return Response.json({ error: sendError.message }, { status: 500 })
  }

  const sentAt = new Date().toISOString()
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('ai_documents')
    .update({
      status: 'sent',
      recipient_email: recipient,
      sent_at: sentAt,
      updated_at: sentAt,
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id, title, status, recipient_email, sent_at')
    .single()

  if (updateError) {
    return Response.json({ error: updateError.message }, { status: 500 })
  }

  return Response.json({ data: updated, providerId: data?.id })
}
