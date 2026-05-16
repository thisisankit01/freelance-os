import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'payouts',
  select: '*, team_members(id, name), projects(id, title)',
  fields: {
    team_member_id: { type: 'string', nullable: true },
    project_id: { type: 'string', nullable: true },
    amount: { type: 'number', required: true },
    status: { type: 'string' },
    due_date: { type: 'date', nullable: true },
    paid_at: { type: 'date', nullable: true },
    notes: { type: 'string', nullable: true },
  },
  filters: { status: 'status', teamMemberId: 'team_member_id' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
