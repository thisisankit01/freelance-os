import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'expenses',
  fields: {
    category: { type: 'string', required: true },
    amount: { type: 'number', required: true },
    gst_amount: { type: 'number', nullable: true },
    date: { type: 'date', nullable: true },
    description: { type: 'string', nullable: true },
    receipt_url: { type: 'string', nullable: true },
  },
  orderBy: 'date',
  filters: { category: 'category' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
