import { createCrudHandlers } from '@/lib/api/crud-route'

const handlers = createCrudHandlers({
  table: 'work_assignments',
  select: '*, team_members(id, name), tasks(id, title), projects(id, title)',
  fields: {
    team_member_id: { type: 'string', nullable: true },
    task_id: { type: 'string', nullable: true },
    project_id: { type: 'string', nullable: true },
    title: { type: 'string', nullable: true },
    status: { type: 'string' },
    due_date: { type: 'date', nullable: true },
  },
  filters: { status: 'status', teamMemberId: 'team_member_id', projectId: 'project_id' },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
