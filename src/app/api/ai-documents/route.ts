import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'ai_documents',
  select: '*, clients(id, name, email), projects(id, title), invoices(id, invoice_number)',
  fields: {
    client_id: { type: 'string', nullable: true },
    project_id: { type: 'string', nullable: true },
    invoice_id: { type: 'string', nullable: true },
    document_type: { type: 'string', required: true },
    title: { type: 'string', required: true },
    status: { type: 'string' },
    question_answers: { type: 'json' },
    content: { type: 'string', required: true },
    recipient_email: { type: 'string', nullable: true },
    sent_at: { type: 'date', nullable: true },
    updated_at: { type: 'date', nullable: true },
  },
  filters: { type: 'document_type', status: 'status' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
