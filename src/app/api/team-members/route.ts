import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'team_members',
  fields: {
    name: { type: 'string', required: true },
    email: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    role: { type: 'string', nullable: true },
    payout_rate: { type: 'number', nullable: true },
    payout_type: { type: 'string' },
    status: { type: 'string' },
  },
  filters: { status: 'status' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
