import { create } from 'zustand'
import { nanoid } from 'nanoid'

export type PmMessageChip = { label: string; payload: string }

export type PmChatMessage = {
    id: string
    role: 'user' | 'assistant'
    content: string
    createdAt: number
    chips?: PmMessageChip[]
}

type PendingConfirm =
    | {
          kind: 'delete_project'
          projectId: string
          title: string
      }
    | {
          kind: 'delete_task'
          taskId: string
          title: string
      }
    | {
          kind: 'batch_mark_tasks'
          items: { id: string; prevStatus: string }[]
          nextStatus: string
          summary: string
      }
    | {
          kind: 'email_invoice'
          invoiceNumber?: string
          clientName?: string
      }
    | {
          kind: 'send_reminder'
          appointmentId: string
          title: string
          clientName?: string
      }
    | {
          kind: 'mark_invoice_status'
          invoiceId: string
          invoiceNumber: string
          status: string
      }
    | {
          kind: 'send_document'
          documentId: string
          title: string
          recipientEmail: string
          documentType: 'contract' | 'legal_notice'
      }

type UndoFn = () => Promise<void>

type PendingClarification = {
    originalPrompt: string
    slot: 'project' | 'client' | 'invoice' | 'amount' | 'recipient' | 'detail'
    createdAt: number
}

const LS_KEY = 'soloos:pm-chat:v1'
const MAX_MESSAGES = 100

function loadMessages(): PmChatMessage[] {
    if (typeof window === 'undefined') return []
    try {
        const raw = localStorage.getItem(LS_KEY)
        if (!raw) return []
        const parsed = JSON.parse(raw) as PmChatMessage[]
        return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : []
    } catch {
        return []
    }
}

function saveMessages(messages: PmChatMessage[]) {
    if (typeof window === 'undefined') return
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)))
    } catch {
        /* ignore quota */
    }
}

type PmChatStore = {
    messages: PmChatMessage[]
    taskBoardProjectId: string | null
    taskBoardProjectTitle: string | null
    taskStatusFilter: string | null
    lastMentionedTaskId: string | null
    lastMentionedProjectId: string | null
    pendingConfirm: PendingConfirm | null
    pendingClarification: PendingClarification | null
    undoStack: { label: string; run: UndoFn }[]

    addUserMessage: (content: string) => void
    addAssistantMessage: (content: string, chips?: PmMessageChip[]) => void
    setTaskView: (projectId: string | null, projectTitle: string | null) => void
    setTaskStatusFilter: (status: string | null) => void
    clearTaskFilters: () => void
    setLastMentionedTask: (id: string | null) => void
    setLastMentionedProject: (id: string | null) => void
    setPendingConfirm: (p: PendingConfirm | null) => void
    setPendingClarification: (p: PendingClarification | null) => void
    pushUndo: (label: string, run: UndoFn) => void
    popUndo: () => Promise<{ label: string; ok: boolean } | null>
    cancelPending: () => void
}

export const usePmChatStore = create<PmChatStore>((set, get) => ({
    messages: [],
    taskBoardProjectId: null,
    taskBoardProjectTitle: null,
    taskStatusFilter: null,
    lastMentionedTaskId: null,
    lastMentionedProjectId: null,
    pendingConfirm: null,
    pendingClarification: null,
    undoStack: [],

    addUserMessage: (content) => {
        const msg: PmChatMessage = {
            id: nanoid(),
            role: 'user',
            content,
            createdAt: Date.now(),
        }
        set((s) => {
            const messages = [...s.messages, msg].slice(-MAX_MESSAGES)
            saveMessages(messages)
            return { messages }
        })
    },

    addAssistantMessage: (content, chips) => {
        const msg: PmChatMessage = {
            id: nanoid(),
            role: 'assistant',
            content,
            createdAt: Date.now(),
            chips,
        }
        set((s) => {
            const messages = [...s.messages, msg].slice(-MAX_MESSAGES)
            saveMessages(messages)
            return { messages }
        })
    },

    setTaskView: (projectId, projectTitle) =>
        set({
            taskBoardProjectId: projectId,
            taskBoardProjectTitle: projectTitle,
            ...(projectId ? { lastMentionedProjectId: projectId } : {}),
        }),

    setTaskStatusFilter: (status) => set({ taskStatusFilter: status }),

    clearTaskFilters: () =>
        set({
            taskBoardProjectId: null,
            taskBoardProjectTitle: null,
            taskStatusFilter: null,
        }),

    setLastMentionedTask: (id) => set({ lastMentionedTaskId: id }),
    setLastMentionedProject: (id) => set({ lastMentionedProjectId: id }),

    setPendingConfirm: (p) => set({ pendingConfirm: p }),
    setPendingClarification: (p) => set({ pendingClarification: p }),

    pushUndo: (label, run) =>
        set((s) => {
            const undoStack = [...s.undoStack, { label, run }].slice(-10)
            return { undoStack }
        }),

    popUndo: async () => {
        const { undoStack } = get()
        if (undoStack.length === 0) return null
        const last = undoStack[undoStack.length - 1]!
        set({ undoStack: undoStack.slice(0, -1) })
        try {
            await last.run()
            return { label: last.label, ok: true }
        } catch {
            return { label: last.label, ok: false }
        }
    },

    cancelPending: () => set({ pendingConfirm: null }),
}))

export function hydratePmChatFromStorage() {
    const messages = loadMessages()
    usePmChatStore.setState({ messages })
}
