/** Dashboard components that share project/task command mode in the main command bar */
export const PM_WORKSPACE_COMPONENTS = new Set([
    'ProjectBoard',
    'TaskBoard',
    'TimeTracker',
    'ProjectProfit',
])

export function isPmWorkspaceActive(activeComponents: string[]) {
    return activeComponents.some((n) => PM_WORKSPACE_COMPONENTS.has(n))
}
