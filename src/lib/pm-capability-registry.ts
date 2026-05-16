export type PmCapability = {
    id: string
    commandKind: string
    surface: string
    description: string
    naturalPhrases: string[]
    safety: 'read' | 'write' | 'send' | 'delete'
    requiredFields?: string[]
}

export const PM_CAPABILITIES: PmCapability[] = [
    {
        id: 'business_finance_dashboard',
        commandKind: 'show_profit_loss',
        surface: 'ProfitLoss',
        description:
            'Business-wide financial health, revenue, expenses, profit, loss, margins, monthly P&L, charts, graphs, insights, and where money is being lost.',
        naturalPhrases: [
            'how is my business performing',
            'where am i losing money',
            'show revenue vs expenses',
            'open finance dashboard',
            'show profit and loss',
            'show financial insights',
            'show business analytics',
        ],
        safety: 'read',
    },
    {
        id: 'project_profitability',
        commandKind: 'show_project_profit',
        surface: 'ProjectProfit',
        description:
            'Project-level profitability, budgets versus hours, effective hourly rate, best hourly rate, most profitable project, and revenue per hour.',
        naturalPhrases: [
            'which project has best hourly rate',
            'show project profitability',
            'how much did i earn per hour on website',
            'show revenue vs hours',
            'most profitable project',
        ],
        safety: 'read',
    },
    {
        id: 'projects',
        commandKind: 'list_projects | create_project | open_project_editor | update_project | rename_project | delete_project | set_project_status | behind_schedule_projects',
        surface: 'ProjectBoard',
        description:
            'Create, open, edit, rename, delete, review, pause, resume, list, and track project status or deadlines.',
        naturalPhrases: [
            'show my projects',
            'edit website project',
            'move website to review',
            'what projects are behind schedule',
            'set website budget to 50000',
        ],
        safety: 'write',
    },
    {
        id: 'tasks_time_tracking',
        commandKind: 'show_tasks | add_task | update_task | mark_task | delete_task | start_timer | stop_timer',
        surface: 'ProjectBoard, TimeTracker',
        description:
            'Create, edit, complete, delete, filter, and time-track tasks. Includes start/stop timers and billable work tracking.',
        naturalPhrases: [
            'add task homepage to website',
            'finish logo task',
            'start timer for logo design',
            'stop timer',
            'show overdue tasks',
        ],
        safety: 'write',
    },
    {
        id: 'clients',
        commandKind: 'list_clients | open_client_import | create_client | update_client | delete_client',
        surface: 'ClientTable',
        description: 'Find, filter, import, create, edit, archive, delete, and bulk-onboard real clients from Google Contacts or AI-parsed pasted lists.',
        naturalPhrases: ['show clients', 'find Rahul', 'show active clients', 'clients in Mumbai', 'import clients', 'import Google contacts', 'add client Rahul email rahul@example.com', 'archive client Rahul'],
        safety: 'read',
    },
    {
        id: 'invoices',
        commandKind: 'list_invoices | show_invoice | create_invoice | mark_invoice_status | email_invoice',
        surface: 'InvoiceTable',
        description:
            'List, show, create, mark paid/sent/overdue, and email invoices. Sending and payment-like changes require confirmation.',
        naturalPhrases: [
            'show invoices',
            'show invoice INV-001',
            'make bill for Rahul 5000',
            'mark invoice INV-001 paid',
            'email invoice to Rahul',
        ],
        safety: 'send',
    },
    {
        id: 'inventory',
        commandKind: 'list_inventory | add_inventory | update_inventory_quantity',
        surface: 'InventoryGrid',
        description: 'Inventory, stock levels, low stock alerts, product quantity, item cost, and categories.',
        naturalPhrases: ['show low stock', 'add inventory camera quantity 2', 'set battery stock to 8'],
        safety: 'write',
    },
    {
        id: 'expenses',
        commandKind: 'list_expenses | add_expense',
        surface: 'ExpenseTracker',
        description:
            'Expense list, category filters, GST amount, software/travel/equipment/rent costs, and expense entry.',
        naturalPhrases: ['show expenses', 'log software expense 999', 'show travel costs'],
        safety: 'write',
    },
    {
        id: 'team_payouts_assignments',
        commandKind: 'list_team | add_team_member | list_payouts | add_payout | list_assignments | assign_work',
        surface: 'TeamTable, PayoutTracker, WorkAssignment',
        description:
            'Team members, subcontractors, intern assignments, task ownership, payouts owed, and staff costs.',
        naturalPhrases: [
            'show team',
            'add team member Aman designer',
            'assign homepage task to Aman',
            'show payouts',
            'add payout Aman 5000',
        ],
        safety: 'write',
    },
    {
        id: 'invoice_templates',
        commandKind: 'list_invoice_templates | create_invoice_template | update_invoice_template',
        surface: 'InvoiceTemplateEditor',
        description:
            'Invoice template customization, default template, email subject, client message, terms, footer, and accent color.',
        naturalPhrases: [
            'show invoice templates',
            'create invoice template Premium',
            'make premium template default',
            'set template message',
        ],
        safety: 'write',
    },
    {
        id: 'documents',
        commandKind: 'list_documents | draft_contract | draft_legal_notice | send_document',
        surface: 'AiDocumentCenter',
        description:
            'AI contracts, legal notices for non-payment, saved document drafts, editing, PDF attachment, and confirmed email send.',
        naturalPhrases: [
            'draft contract for Rahul project Website',
            'draft legal notice for Rahul invoice INV-001',
            'show contracts',
            'send saved legal notice to Rahul',
        ],
        safety: 'send',
    },
    {
        id: 'payment_links',
        commandKind: 'list_payment_links | create_payment_link',
        surface: 'PaymentLinks',
        description:
            'Payment links for invoices and payment-link setup status. Live Razorpay provider actions are external integration work.',
        naturalPhrases: ['show payment links', 'create payment link for invoice INV-001'],
        safety: 'send',
    },
    {
        id: 'calendar_reminders',
        commandKind: 'send_reminder',
        surface: 'Calendar',
        description: 'Calendar reminders and client reminder messages. Sending requires confirmation.',
        naturalPhrases: ['remind Rahul about tomorrow call', 'send reminder to Priya'],
        safety: 'send',
    },
]

export function pmCapabilitiesForPrompt() {
    return PM_CAPABILITIES.map((capability, index) => {
        const fields = capability.requiredFields?.length
            ? ` Required fields: ${capability.requiredFields.join(', ')}.`
            : ''

        return `${index + 1}. ${capability.id}
Command kind(s): ${capability.commandKind}
Primary UI: ${capability.surface}
Safety: ${capability.safety}
Meaning: ${capability.description}${fields}
Example human phrases: ${capability.naturalPhrases.join(' | ')}`
    }).join('\n\n')
}
