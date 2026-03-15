/** In-memory store mapping Notion page IDs to Spektrum project/task metadata */
const registry = new Map<string, { projectId: string; taskId: string; databaseIds: string[] }>()

/** All database IDs ever used — fallback when Spektrum app sends wrong query params */
let allDatabaseIds: string[] = []

export function registerDashboard(pageId: string, projectId: string, taskId: string, databaseIds: string[] = []) {
  registry.set(pageId, { projectId, taskId, databaseIds })
  // Keep a running list of all known database IDs
  for (const id of databaseIds) {
    if (!allDatabaseIds.includes(id)) allDatabaseIds.push(id)
  }
}

export function getDashboard(pageId: string) {
  return registry.get(pageId)
}

export function getAllDatabaseIds(): string[] {
  return allDatabaseIds
}
