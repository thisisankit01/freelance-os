import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'invoice_templates',
  fields: {
    name: { type: 'string', required: true },
    accent_color: { type: 'string', nullable: true },
    logo_url: { type: 'string', nullable: true },
    payment_terms: { type: 'string', nullable: true },
    footer_note: { type: 'string', nullable: true },
    default_email_subject: { type: 'string', nullable: true },
    default_email_message: { type: 'string', nullable: true },
    is_default: { type: 'boolean' },
    updated_at: { type: 'date', nullable: true },
  },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
