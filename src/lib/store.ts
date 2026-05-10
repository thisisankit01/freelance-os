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
    reset: () => void
}

const defaultState: UIState = {
    activeComponents: ['StatsBar', 'ClientTable'],
    filters: {},
    emptyMessage: '',
    selectedClientId: null,
    selectedInvoiceId: null,
}

export const useStore = create<Store>((set) => ({
    ...defaultState,
    setComponents: (components) => set({ activeComponents: components }),
    setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
    clearFilters: () => set({ filters: {}, emptyMessage: '' }),
    setEmptyMessage: (msg) => set({ emptyMessage: msg }),
    selectClient: (id) => set({ selectedClientId: id }),
    selectInvoice: (id) => set({ selectedInvoiceId: id }),
    reset: () => set(defaultState),
}))