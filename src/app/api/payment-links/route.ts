import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'payment_links',
  select: '*, invoices(id, invoice_number, total, clients(id, name, email))',
  fields: {
    invoice_id: { type: 'string', nullable: true },
    provider: { type: 'string' },
    provider_payment_link_id: { type: 'string', nullable: true },
    url: { type: 'string', nullable: true },
    amount: { type: 'number', nullable: true },
    status: { type: 'string' },
    paid_at: { type: 'date', nullable: true },
  },
  filters: { status: 'status', invoiceId: 'invoice_id' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
