import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'inventory',
  fields: {
    item_name: { type: 'string', required: true },
    quantity: { type: 'integer' },
    unit_cost: { type: 'number', nullable: true },
    low_stock_threshold: { type: 'integer' },
    category: { type: 'string', nullable: true },
  },
  filters: { category: 'category' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
