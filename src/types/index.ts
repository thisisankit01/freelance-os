// src/types/index.ts

export type Client = {
    id: string
    name: string
    email: string
    phone: string
    company: string
    city: string
    status: 'active' | 'inactive'
    total_billed: number
    total_paid: number
    notes: string
    created_at: string
}

export type Invoice = {
    id: string
    client_id: string
    invoice_number: string
    status: 'draft' | 'sent' | 'paid' | 'overdue'
    subtotal: number
    gst_rate: number
    gst_amount: number
    total: number
    due_date: string
    created_at: string
    client?: Client
    items?: InvoiceItem[]
}

export type InvoiceItem = {
    id: string
    description: string
    quantity: number
    rate: number
    amount: number
}

export type UIState = {
    activeComponents: string[]
    filters: Record<string, string>
    emptyMessage: string        // AI-provided message shown when a query returns 0 results
    selectedClientId: string | null
    selectedInvoiceId: string | null
    appointmentAction: string | null   // 'create_appointment' | 'cancel_appointment' | 'cancel_appointments_bulk' | null
    appointmentData?: Record<string, string>  // create/cancel fields, or bulk: bulkScope, month (YYYY-MM), clientName
}