export interface CommandSuggestion {
  id: string
  label: string
  category: 'client' | 'invoice' | 'calendar' | 'project' | 'task' | 'payment' | 'time' | 'general'
  icon?: string
  requiresInput?: boolean
}

export const STATIC_COMMANDS: CommandSuggestion[] = [
  // Clients
  { id: 'show-clients', label: 'Show all clients', category: 'client', icon: '👥' },
  { id: 'active-clients', label: 'Show active clients', category: 'client', icon: '👥' },
  { id: 'inactive-clients', label: 'Show inactive clients', category: 'client', icon: '👥' },
  { id: 'find-client', label: 'Find client named ...', category: 'client', icon: '🔍', requiresInput: true },
  { id: 'add-client', label: 'Add client ...', category: 'client', icon: '➕', requiresInput: true },
  { id: 'client-city', label: 'Clients in ...', category: 'client', icon: '📍', requiresInput: true },

  // Invoices
  { id: 'show-invoices', label: 'Show all invoices', category: 'invoice', icon: '🧾' },
  { id: 'overdue-invoices', label: 'Show overdue invoices', category: 'invoice', icon: '⚠️' },
  { id: 'paid-invoices', label: 'Show paid invoices', category: 'invoice', icon: '✅' },
  { id: 'draft-invoices', label: 'Show draft invoices', category: 'invoice', icon: '📝' },
  { id: 'create-invoice', label: 'Create invoice for ...', category: 'invoice', icon: '💰', requiresInput: true },

  // Calendar / Appointments
  { id: 'show-calendar', label: 'Show calendar', category: 'calendar', icon: '📅' },
  { id: 'schedule-meeting', label: 'Schedule meeting with ...', category: 'calendar', icon: '📅', requiresInput: true },
  { id: 'cancel-meeting', label: 'Cancel meeting with ...', category: 'calendar', icon: '❌', requiresInput: true },
  { id: 'my-appointments', label: 'Show my appointments', category: 'calendar', icon: '📆' },
  { id: 'slot-picker', label: 'Send booking link to ...', category: 'calendar', icon: '🔗', requiresInput: true },
  { id: 'reminder', label: 'Send reminder to ...', category: 'calendar', icon: '🔔', requiresInput: true },

  // Projects
  { id: 'show-projects', label: 'Show projects', category: 'project', icon: '📊' },
  { id: 'new-project', label: 'New project ...', category: 'project', icon: '🆕', requiresInput: true },
  { id: 'project-profit', label: 'Show project profitability', category: 'project', icon: '💹' },
  { id: 'project-insights', label: 'Show project insights and charts', category: 'project', icon: '📊' },
  { id: 'project-kanban', label: 'Open project board', category: 'project', icon: '📋' },

  // Tasks
  { id: 'show-tasks', label: 'Show all tasks', category: 'task', icon: '✅' },
  { id: 'tasks-project', label: 'Show tasks in ...', category: 'task', icon: '📂', requiresInput: true },
  { id: 'add-task', label: 'Add task ...', category: 'task', icon: '➕', requiresInput: true },
  { id: 'overdue-tasks', label: 'Show overdue tasks', category: 'task', icon: '⏰' },

  // Time Tracking
  { id: 'start-timer', label: 'Start timer', category: 'time', icon: '⏱️' },
  { id: 'stop-timer', label: 'Stop timer', category: 'time', icon: '⏹️' },
  { id: 'time-entries', label: 'Show time entries', category: 'time', icon: '🕒' },

  // Operations
  { id: 'inventory', label: 'Show inventory', category: 'general', icon: '📦' },
  { id: 'low-stock', label: 'Show low stock', category: 'general', icon: '⚠️' },
  { id: 'add-expense', label: 'Add expense ...', category: 'general', icon: '🧾', requiresInput: true },
  { id: 'profit-loss', label: 'Show profit and loss', category: 'general', icon: '📉' },
  { id: 'financial-insights', label: 'Show financial insights and graphs', category: 'general', icon: '📊' },
  { id: 'team', label: 'Show team', category: 'general', icon: '👤' },
  { id: 'payouts', label: 'Show payouts', category: 'general', icon: '💸' },
  { id: 'assign-work', label: 'Assign task to ...', category: 'general', icon: '📌', requiresInput: true },
  { id: 'invoice-templates', label: 'Show invoice templates', category: 'invoice', icon: '🎨' },
  { id: 'template-message', label: 'Set invoice template message to ...', category: 'invoice', icon: '✉️', requiresInput: true },
  { id: 'template-default', label: 'Make invoice template default ...', category: 'invoice', icon: '⭐', requiresInput: true },
  { id: 'documents', label: 'Show contracts and legal notices', category: 'general', icon: '📄' },
  { id: 'draft-contract', label: 'Draft contract for ...', category: 'general', icon: '📄', requiresInput: true },
  { id: 'send-contract', label: 'Send contract to ...', category: 'general', icon: '📤', requiresInput: true },
  { id: 'send-legal-notice', label: 'Send legal notice to ...', category: 'general', icon: '⚖️', requiresInput: true },
  { id: 'payment-links', label: 'Show payment links', category: 'payment', icon: '🔗' },

  // Payments / Stats
  { id: 'who-owes', label: 'Who hasn\'t paid me?', category: 'payment', icon: '💸' },
  { id: 'payment-status', label: 'Show payment status', category: 'payment', icon: '💳' },
  { id: 'stats', label: 'Show stats', category: 'general', icon: '📈' },
  { id: 'help', label: 'What can you do?', category: 'general', icon: '❓' },
]
