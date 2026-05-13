import type { ParsedPmCommand } from '@/lib/pm-command-parser'
import { mapProjectStatus, mapTaskStatus } from '@/lib/pm-command-parser'
import { usePmChatStore } from '@/lib/pm-chat-store'

type ProjectRow = { id: string; title: string; status?: string }
type TaskRow = {
    id: string
    title: string
    status: string
    project_id: string
    due_date?: string | null
    projects?: { id: string; title: string }
}

function scoreMatch(query: string, title: string) {
    const q = query.toLowerCase().trim()
    const t = title.toLowerCase().trim()
    if (!q) return 0
    if (t === q) return 100
    if (t.startsWith(q)) return 90
    if (t.includes(q)) return 75
    const parts = q.split(/\s+/).filter((p) => p.length > 1)
    if (parts.length && parts.every((p) => t.includes(p))) return 55
    return 0
}

/** Edit distance for typo-tolerant project matching (titles are short). */
function levenshtein(a: string, b: string): number {
    const m = a.length
    const n = b.length
    if (!n) return m
    if (!m) return n
    const prev = new Array<number>(n + 1)
    const cur = new Array<number>(n + 1)
    for (let j = 0; j <= n; j++) prev[j] = j
    for (let i = 1; i <= m; i++) {
        cur[0] = i
        const ca = a.charCodeAt(i - 1)
        for (let j = 1; j <= n; j++) {
            const cost = ca === b.charCodeAt(j - 1) ? 0 : 1
            cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + cost)
        }
        for (let j = 0; j <= n; j++) prev[j] = cur[j]!
    }
    return prev[n]!
}

/** Rank projects when the query is garbled or misspelled — nearest titles first. */
function fuzzyRankProjects(query: string, projects: ProjectRow[]): { p: ProjectRow; score: number }[] {
    const q = query.toLowerCase().trim()
    if (!q) return []
    return projects
        .map((p) => {
            const t = p.title.toLowerCase().trim()
            let score = scoreMatch(query, p.title)
            if (score < 70) {
                const maxLen = Math.max(q.length, t.length, 1)
                const levFull = Math.round(100 * (1 - levenshtein(q, t) / maxLen))
                const words = t.split(/\s+/).filter((w) => w.length > 0)
                let levWord = 0
                for (const w of words) {
                    const mw = Math.max(q.length, w.length, 1)
                    levWord = Math.max(levWord, Math.round(100 * (1 - levenshtein(q, w) / mw)))
                }
                const prefix =
                    q.length >= 2 && t.startsWith(q.slice(0, Math.min(4, q.length))) ? 42 : 0
                score = Math.max(score, levFull, Math.round(levWord * 0.95), prefix)
            }
            return { p, score }
        })
        .sort((a, b) => b.score - a.score)
}

const PROJECT_STATUS_LABEL: Record<string, string> = {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    review: 'Review',
    done: 'Done',
    on_hold: 'On Hold',
}

const ALLOWED_PROJECT_STATUS = new Set(['not_started', 'in_progress', 'review', 'done', 'on_hold'])

function pickProjectForStatusCommand(
    parsed: Extract<ParsedPmCommand, { kind: 'set_project_status' }>,
    projects: ProjectRow[],
    store: ReturnType<typeof usePmChatStore.getState>,
):
    | { ok: true; project: ProjectRow }
    | { ok: false; reason: 'no_current' }
    | { ok: false; reason: 'none' }
    | { ok: false; reason: 'fuzzy'; candidates: ProjectRow[] }
    | { ok: false; reason: 'ambiguous'; matches: ProjectRow[] } {
    const ref = parsed.projectRef
    if (ref.kind === 'id') {
        const p = projects.find((x) => x.id === ref.id)
        return p ? { ok: true, project: p } : { ok: false, reason: 'none' }
    }
    if (ref.kind === 'current') {
        const id = store.taskBoardProjectId || store.lastMentionedProjectId
        if (!id) return { ok: false, reason: 'no_current' }
        const p = projects.find((x) => x.id === id)
        return p ? { ok: true, project: p } : { ok: false, reason: 'none' }
    }
    const name = ref.name
    const matches = projects.filter((p) => scoreMatch(name, p.title) > 0)
    if (matches.length === 0) {
        const ranked = fuzzyRankProjects(name, projects).filter((x) => x.score >= 42).slice(0, 6).map((x) => x.p)
        if (ranked.length > 0) return { ok: false, reason: 'fuzzy', candidates: ranked }
        return { ok: false, reason: 'none' }
    }
    if (matches.length > 1) {
        return { ok: false, reason: 'ambiguous', matches: matches.slice(0, 4) }
    }
    return { ok: true, project: matches[0]! }
}

function pickBestProject(name: string, projects: ProjectRow[]): ProjectRow | null {
    const ranked = projects
        .map((p) => ({ p, s: scoreMatch(name, p.title) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
    return ranked[0]?.p ?? null
}

type TaskResolve =
    | { ok: true; task: TaskRow }
    | { ok: false; reason: 'none' }
    | { ok: false; reason: 'ambiguous'; candidates: TaskRow[] }

/** When two matches are close in score, ask the user to pick a task. */
function resolveTaskMatch(title: string, tasks: TaskRow[]): TaskResolve {
    if (title === '__last__') {
        const id = usePmChatStore.getState().lastMentionedTaskId
        const t = id ? tasks.find((x) => x.id === id) : undefined
        return t ? { ok: true, task: t } : { ok: false, reason: 'none' }
    }
    const ranked = tasks
        .map((t) => ({ t, s: scoreMatch(title, t.title) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
    if (ranked.length === 0) return { ok: false, reason: 'none' }
    const top = ranked[0]!
    if (ranked.length === 1) return { ok: true, task: top.t }
    const second = ranked[1]!
    const tight = top.s < 100 && top.s - second.s < 12
    if (tight) {
        const minS = second.s
        const candidates = ranked.filter((x) => x.s >= minS - 1).slice(0, 6).map((x) => x.t)
        return { ok: false, reason: 'ambiguous', candidates }
    }
    return { ok: true, task: top.t }
}

export type RunnerResult = {
    reply: string
    chips?: { label: string; payload: string }[]
}

async function apiProjects(): Promise<ProjectRow[]> {
    const res = await fetch('/api/projects')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load projects')
    return json.data || []
}

async function apiTasks(projectId?: string | null): Promise<TaskRow[]> {
    const params = new URLSearchParams()
    if (projectId) params.set('projectId', projectId)
    const res = await fetch(`/api/tasks?${params}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Failed to load tasks')
    return json.data || []
}

async function findTaskById(id: string): Promise<TaskRow | null> {
    const tasks = await apiTasks(null)
    return tasks.find((t) => t.id === id) ?? null
}

export async function runPmCommand(parsed: ParsedPmCommand): Promise<RunnerResult> {
    const store = usePmChatStore.getState()

    if (parsed.kind === 'confirm_no') {
        store.setPendingConfirm(null)
        return { reply: 'Cancelled.' }
    }

    if (parsed.kind === 'confirm_yes') {
        const p = store.pendingConfirm
        if (!p) return { reply: 'Nothing to confirm.' }
        store.setPendingConfirm(null)
        if (p.kind === 'delete_project') {
            const res = await fetch('/api/projects', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.projectId }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) return { reply: `Could not delete: ${json.error || res.statusText}` }
            if (store.taskBoardProjectId === p.projectId) store.clearTaskFilters()
            if (store.lastMentionedProjectId === p.projectId) store.setLastMentionedProject(null)
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: `Deleted project **${p.title}**.` }
        }
        if (p.kind === 'delete_task') {
            const res = await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: p.taskId }),
            })
            const json = await res.json().catch(() => ({}))
            if (!res.ok) return { reply: `Could not delete task: ${json.error || res.statusText}` }
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: `Deleted task **${p.title}**.` }
        }
        if (p.kind === 'batch_mark_tasks') {
            const { items, nextStatus } = p
            for (const it of items) {
                const res = await fetch('/api/tasks', {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: it.id, status: nextStatus }),
                })
                if (!res.ok) {
                    const j = await res.json().catch(() => ({}))
                    return { reply: `Stopped: could not update a task — ${j.error || res.statusText}` }
                }
            }
            const snapshot = [...items]
            store.pushUndo(`Batch mark (${items.length})`, async () => {
                for (const it of snapshot) {
                    await fetch('/api/tasks', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: it.id, status: it.prevStatus }),
                    })
                }
            })
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: `Updated **${items.length}** task(s) to **${nextStatus}**.` }
        }
        return { reply: 'Done.' }
    }

    if (parsed.kind === 'undo') {
        const u = await store.popUndo()
        if (!u) return { reply: 'Nothing to undo.' }
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: u.ok ? `Undid: ${u.label}` : 'Undo failed.' }
    }

    if (parsed.kind === 'help') {
        return {
            reply:
                '**Projects:** create project [name] · list projects · rename project [old] to [new] · delete project [name] · **put project [name] on hold** · **mark project [name] as in progress / review / done**\n' +
                '**Current project:** after **show tasks in X** or creating a project: **make this project on hold** · **set this project to review**\n' +
                '**Tasks:** add task … · delete task … · mark … as done · **mark all tasks as …** · **mark all tasks in [project] as …**\n' +
                '**View:** show tasks in [project] · show all tasks · show completed tasks · clear filters\n' +
                '**Other:** summary · current context · undo · yes/no after confirmations',
        }
    }

    if (parsed.kind === 'clear_filters') {
        store.clearTaskFilters()
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: 'Filters cleared. Showing all tasks.' }
    }

    if (parsed.kind === 'current_context') {
        const pid = store.taskBoardProjectId
        const title = store.taskBoardProjectTitle
        const st = store.taskStatusFilter
        if (!pid && !st) return { reply: 'No task filter — showing all projects / all tasks.' }
        const parts: string[] = []
        if (pid && title) parts.push(`Task view: **${title}**`)
        if (st) parts.push(`Status filter: **${st}**`)
        return { reply: parts.join(' · ') }
    }

    if (parsed.kind === 'summary') {
        const projects = await apiProjects()
        const tasks = await apiTasks()
        const done = tasks.filter((t) => t.status === 'done').length
        return {
            reply: `**${projects.length}** projects · **${tasks.length}** tasks (**${done}** done).`,
        }
    }

    if (parsed.kind === 'list_projects') {
        const projects = await apiProjects()
        if (projects.length === 0) return { reply: 'No projects yet. Say **create project [name]**.' }
        const lines = projects.map((p) => `• **${p.title}**`).join('\n')
        return { reply: `Projects:\n${lines}` }
    }

    if (parsed.kind === 'show_tasks') {
        if (parsed.all) {
            store.clearTaskFilters()
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: 'Showing **all** tasks (no project filter).' }
        }
        if (!parsed.projectName) return { reply: 'Say which project: **show tasks in [name]**.' }
        const projects = await apiProjects()
        const matches = projects.filter((p) => scoreMatch(parsed.projectName!, p.title) > 0)
        if (matches.length === 0) {
            const ranked = fuzzyRankProjects(parsed.projectName!, projects)
            const top = ranked.slice(0, 6)
            const best = top[0]
            if (top.length > 0 && best && best.score >= 42) {
                return {
                    reply:
                        best.score >= 58
                            ? `Closest to “${parsed.projectName}” looks like **${best.p.title}**. Tap to confirm or pick another:`
                            : `No exact match for “${parsed.projectName}”. Did you mean one of these?`,
                    chips: top.map((x) => ({
                        label: x.p.title,
                        payload: `show tasks in ${x.p.title}`,
                    })),
                }
            }
            if (projects.length > 0 && projects.length <= 14) {
                return {
                    reply: `No project named like “${parsed.projectName}”. Pick one of your **${projects.length}** projects:`,
                    chips: projects.map((p) => ({
                        label: p.title,
                        payload: `show tasks in ${p.title}`,
                    })),
                }
            }
            return { reply: `No project matching “${parsed.projectName}”. Try **list projects**.` }
        }
        if (matches.length > 1) {
            return {
                reply: `Multiple matches for “${parsed.projectName}”. Pick one:`,
                chips: matches.slice(0, 4).map((p) => ({
                    label: p.title,
                    payload: `show tasks in ${p.title}`,
                })),
            }
        }
        const p = matches[0]!
        store.setTaskView(p.id, p.title)
        store.setTaskStatusFilter(null)
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Filtering tasks to **${p.title}**.` }
    }

    if (parsed.kind === 'filter_tasks_status') {
        const raw = parsed.status
        if (raw.startsWith('due:')) {
            store.setTaskStatusFilter(raw)
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: `Filter: **${raw.replace('due:', 'due ')}** (applied in task list).` }
        }
        if (raw === 'overdue') {
            store.setTaskStatusFilter('overdue')
            window.dispatchEvent(new Event('freelanceos:pm-refresh'))
            return { reply: 'Showing **overdue** tasks (by due date).' }
        }
        store.setTaskStatusFilter(raw)
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Filter: tasks with status **${raw}**.` }
    }

    if (parsed.kind === 'create_project') {
        if (!parsed.name) return { reply: 'Give a project name, e.g. **create project Website**.' }
        const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: parsed.name }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not create: ${json.error || res.statusText}` }
        const created = json.data as { id: string; title: string }
        store.setLastMentionedProject(created.id)
        store.pushUndo(`Created project “${created.title}”`, async () => {
            await fetch('/api/projects', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: created.id }),
            })
        })
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return {
            reply: `Created project **${created.title}**.`,
            chips: [{ label: 'View tasks in this project', payload: `show tasks in ${created.title}` }],
        }
    }

    if (parsed.kind === 'rename_project') {
        const projects = await apiProjects()
        const proj = pickBestProject(parsed.from, projects)
        if (!proj) return { reply: `Could not find project “${parsed.from}”.` }
        const res = await fetch('/api/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: proj.id, title: parsed.to }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Rename failed: ${json.error || res.statusText}` }
        if (store.taskBoardProjectId === proj.id) store.setTaskView(proj.id, parsed.to)
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Renamed **${proj.title}** → **${parsed.to}**.` }
    }

    if (parsed.kind === 'set_project_status') {
        const next =
            ALLOWED_PROJECT_STATUS.has(parsed.status) ? parsed.status : mapProjectStatus(parsed.status)
        if (!ALLOWED_PROJECT_STATUS.has(next)) {
            return {
                reply: 'Use a board column: **not started**, **in progress**, **review**, **done**, **on hold**.',
            }
        }
        const projects = await apiProjects()
        const picked = pickProjectForStatusCommand(parsed, projects, store)
        if (picked.ok === false) {
            if (picked.reason === 'no_current') {
                return {
                    reply: 'Name the project (**put project Acme on hold**) or focus one with **show tasks in [name]** / pick a board card — then **make this project on hold** works.',
                }
            }
            if (picked.reason === 'ambiguous') {
                return {
                    reply: 'Which project?',
                    chips: picked.matches.map((p) => ({
                        label: p.title,
                        payload: `__pm:projstatus:${p.id}:${next}`,
                    })),
                }
            }
            if (picked.reason === 'fuzzy') {
                return {
                    reply: 'Did you mean one of these?',
                    chips: picked.candidates.map((p) => ({
                        label: p.title,
                        payload: `__pm:projstatus:${p.id}:${next}`,
                    })),
                }
            }
            return { reply: 'No project found. Try **list projects**.' }
        }
        const proj = picked.project
        const prevRaw = proj.status && ALLOWED_PROJECT_STATUS.has(proj.status) ? proj.status : proj.status || 'not_started'
        const prev = ALLOWED_PROJECT_STATUS.has(prevRaw) ? prevRaw : 'not_started'
        if (prev === next) {
            const lbl = PROJECT_STATUS_LABEL[next] ?? next
            return { reply: `**${proj.title}** is already **${lbl}**.` }
        }
        const res = await fetch('/api/projects', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: proj.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not update: ${json.error || res.statusText}` }
        store.setLastMentionedProject(proj.id)
        const labelDone = PROJECT_STATUS_LABEL[next] ?? next
        store.pushUndo(`Project “${proj.title}” → ${labelDone}`, async () => {
            await fetch('/api/projects', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: proj.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `**${proj.title}** is now **${labelDone}** on the board.` }
    }

    if (parsed.kind === 'delete_project') {
        const projects = await apiProjects()
        const matches = projects.filter((p) => scoreMatch(parsed.name, p.title) > 0)
        if (matches.length === 0) return { reply: `No project matching “${parsed.name}”.` }
        if (matches.length > 1) {
            return {
                reply: 'Which project?',
                chips: matches.slice(0, 4).map((p) => ({
                    label: p.title,
                    payload: `delete project ${p.title}`,
                })),
            }
        }
        const proj = matches[0]!
        store.setPendingConfirm({ kind: 'delete_project', projectId: proj.id, title: proj.title })
        return {
            reply: `Delete project **${proj.title}** and its tasks from the database? This cannot be undone here.`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'add_task') {
        if (!parsed.title) return { reply: 'What should the task be called?' }
        let projectId: string | null = store.taskBoardProjectId
        let projectTitle = store.taskBoardProjectTitle
        if (parsed.projectName) {
            const projects = await apiProjects()
            const p = pickBestProject(parsed.projectName, projects)
            if (!p) return { reply: `No project “${parsed.projectName}”. **list projects**` }
            projectId = p.id
            projectTitle = p.title
        }
        if (!projectId) {
            const projects = await apiProjects()
            return {
                reply: 'Which project should this task belong to?',
                chips: projects.slice(0, 6).map((p) => ({
                    label: p.title,
                    payload: `add task ${parsed.title} to ${p.title}`,
                })),
            }
        }
        const res = await fetch('/api/tasks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: parsed.title,
                project_id: projectId,
                status: 'todo',
            }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Could not add task: ${json.error || res.statusText}` }
        const task = json.data as TaskRow
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Added task “${task.title}”`, async () => {
            await fetch('/api/tasks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id }),
            })
        })
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Added **${task.title}** to **${projectTitle || 'project'}**.` }
    }

    if (parsed.kind === 'mark_all_tasks') {
        const next = mapTaskStatus(parsed.status)
        let tasks = await apiTasks(null)
        if (parsed.projectName) {
            const projects = await apiProjects()
            const p = pickBestProject(parsed.projectName, projects)
            if (!p) return { reply: `No project matching “${parsed.projectName}”.` }
            tasks = tasks.filter((t) => t.project_id === p.id)
        } else if (store.taskBoardProjectId) {
            tasks = tasks.filter((t) => t.project_id === store.taskBoardProjectId)
        }
        const toUpdate = tasks.filter((t) => t.status !== next)
        if (toUpdate.length === 0) {
            return { reply: 'No tasks to update (already at that status, or list is empty).' }
        }
        const scope =
            parsed.projectName ||
            (store.taskBoardProjectTitle ? `**${store.taskBoardProjectTitle}**` : '**all projects**')
        store.setPendingConfirm({
            kind: 'batch_mark_tasks',
            items: toUpdate.map((t) => ({ id: t.id, prevStatus: t.status })),
            nextStatus: next,
            summary: scope,
        })
        return {
            reply: `Mark **${toUpdate.length}** task(s) in ${scope} as **${next}**?`,
            chips: [
                { label: 'Yes, update all', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'mark_task_by_id') {
        const task = await findTaskById(parsed.taskId)
        if (!task) return { reply: 'Task not found (maybe it was deleted).' }
        const next = mapTaskStatus(parsed.status)
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Update failed: ${json.error || res.statusText}` }
        const prev = task.status
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Marked “${task.title}” as ${next}`, async () => {
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Updated **${task.title}** → **${next}**.` }
    }

    if (parsed.kind === 'delete_task_by_id') {
        const task = await findTaskById(parsed.taskId)
        if (!task) return { reply: 'Task not found.' }
        store.setPendingConfirm({ kind: 'delete_task', taskId: task.id, title: task.title })
        return {
            reply: `Delete task **${task.title}**?`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'delete_task') {
        const pid = store.taskBoardProjectId
        let tasks = await apiTasks(pid)
        let resolved = resolveTaskMatch(parsed.title, tasks)
        if (resolved.ok === false && resolved.reason === 'none' && pid) {
            tasks = await apiTasks(null)
            resolved = resolveTaskMatch(parsed.title, tasks)
        }
        if (resolved.ok === false && resolved.reason === 'none') {
            return {
                reply: `No task matching “${parsed.title}”. Try **show tasks in [project]** or use a more specific name.`,
            }
        }
        if (resolved.ok === false && resolved.reason === 'ambiguous') {
            return {
                reply: `Multiple tasks match “${parsed.title}”. Pick one to delete:`,
                chips: resolved.candidates.map((c) => ({
                    label: `${c.title} (${c.projects?.title ?? 'project'})`,
                    payload: `__pm:delete:${c.id}`,
                })),
            }
        }
        const task = resolved.task
        store.setPendingConfirm({ kind: 'delete_task', taskId: task.id, title: task.title })
        return {
            reply: `Delete task **${task.title}**?`,
            chips: [
                { label: 'Yes, delete', payload: 'yes' },
                { label: 'Cancel', payload: 'no' },
            ],
        }
    }

    if (parsed.kind === 'mark_task') {
        const pid = store.taskBoardProjectId
        let tasks = await apiTasks(pid)
        let resolved = resolveTaskMatch(parsed.title, tasks)
        if (resolved.ok === false && resolved.reason === 'none' && pid) {
            tasks = await apiTasks(null)
            resolved = resolveTaskMatch(parsed.title, tasks)
        }
        if (resolved.ok === false && resolved.reason === 'none') {
            return {
                reply: `No matching task for “${parsed.title}”. Try **show tasks in [project]** first, or be more specific.`,
            }
        }
        if (resolved.ok === false && resolved.reason === 'ambiguous') {
            const next = mapTaskStatus(parsed.status)
            return {
                reply: `Multiple tasks match “${parsed.title}”. Pick one:`,
                chips: resolved.candidates.map((c) => ({
                    label: `${c.title} (${c.projects?.title ?? 'project'})`,
                    payload: `__pm:mark:${c.id}:${next}`,
                })),
            }
        }
        const task = resolved.task
        const next = mapTaskStatus(parsed.status)
        const res = await fetch('/api/tasks', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: task.id, status: next }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) return { reply: `Update failed: ${json.error || res.statusText}` }
        const prev = task.status
        store.setLastMentionedTask(task.id)
        store.pushUndo(`Marked “${task.title}” as ${next}`, async () => {
            await fetch('/api/tasks', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: task.id, status: prev }),
            })
        })
        window.dispatchEvent(new Event('freelanceos:pm-refresh'))
        return { reply: `Updated **${task.title}** → **${next}**.` }
    }

    return { reply: 'Use **help** to see what I can run here.' }
}
