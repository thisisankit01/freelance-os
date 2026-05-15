// src/lib/store.ts
import { create } from 'zustand'
import { UIState } from '@/types'

type Store = UIState & {
    setComponents: (components: string[]) => void
    setFilter: (key: string, value: string) => void
    clearFilters: () => void
    setEmptyMessage: (msg: string) => void
    selectClient: (id: string | null) => void
    selectInvoice: (id: string | null) => void
    setAppointmentAction: (action: string, data?: Record<string, string>) => void
    clearAppointmentAction: () => void
    reset: () => void
}

const defaultState: UIState = {
    activeComponents: [], // ← empty: nothing auto-loads on first visit
    filters: {},
    emptyMessage: '',
    selectedClientId: null,
    selectedInvoiceId: null,
    appointmentAction: null,
    appointmentData: undefined,
}

export const useStore = create<Store>((set) => ({
    ...defaultState,
    setComponents: (components) => set({ activeComponents: components }),
    setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
    clearFilters: () => set({ filters: {}, emptyMessage: '' }),
    setEmptyMessage: (msg) => set({ emptyMessage: msg }),
    selectClient: (id) => set({ selectedClientId: id }),
    selectInvoice: (id) => set({ selectedInvoiceId: id }),
    setAppointmentAction: (action, data) => set({ appointmentAction: action, appointmentData: data }),
    clearAppointmentAction: () => set({ appointmentAction: null, appointmentData: undefined }),
    reset: () => set(defaultState),
}))