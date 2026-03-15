/** In-memory store mapping Notion page IDs to Spektrum project/task metadata */
const registry = new Map<string, { projectId: string; taskId: string }>()

export function registerDashboard(pageId: string, projectId: string, taskId: string) {
  registry.set(pageId, { projectId, taskId })
}

export function getDashboard(pageId: string) {
  return registry.get(pageId)
}
