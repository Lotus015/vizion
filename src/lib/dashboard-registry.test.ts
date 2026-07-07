import { describe, it, expect, vi, beforeEach } from 'vitest'

beforeEach(() => {
  vi.resetModules()
})

describe('dashboard-registry', () => {
  describe('registerDashboard / getDashboard', () => {
    it('stores and retrieves a dashboard by pageId', async () => {
      const { registerDashboard, getDashboard } = await import('./dashboard-registry')
      registerDashboard('page-1', 'proj-1', 'task-1', ['db-1', 'db-2'])
      const result = getDashboard('page-1')
      expect(result).toEqual({
        projectId: 'proj-1',
        taskId: 'task-1',
        databaseIds: ['db-1', 'db-2'],
      })
    })

    it('returns undefined for an unknown pageId', async () => {
      const { getDashboard } = await import('./dashboard-registry')
      expect(getDashboard('nonexistent')).toBeUndefined()
    })

    it('overwrites an existing registration for the same pageId', async () => {
      const { registerDashboard, getDashboard } = await import('./dashboard-registry')
      registerDashboard('page-1', 'old-proj', 'old-task', ['db-1'])
      registerDashboard('page-1', 'new-proj', 'new-task', ['db-2'])
      const result = getDashboard('page-1')
      expect(result).toEqual({
        projectId: 'new-proj',
        taskId: 'new-task',
        databaseIds: ['db-2'],
      })
    })
  })

  describe('getAllDatabaseIds', () => {
    it('accumulates database IDs across registrations', async () => {
      const { registerDashboard, getAllDatabaseIds } = await import('./dashboard-registry')
      registerDashboard('page-1', 'p1', 't1', ['db-1', 'db-2'])
      registerDashboard('page-2', 'p2', 't2', ['db-3'])
      expect(getAllDatabaseIds()).toEqual(['db-1', 'db-2', 'db-3'])
    })

    it('never duplicates IDs', async () => {
      const { registerDashboard, getAllDatabaseIds } = await import('./dashboard-registry')
      registerDashboard('page-1', 'p1', 't1', ['db-1', 'db-2'])
      registerDashboard('page-2', 'p2', 't2', ['db-1', 'db-3'])
      expect(getAllDatabaseIds()).toEqual(['db-1', 'db-2', 'db-3'])
    })

    it('returns an empty array when no dashboards registered', async () => {
      const { getAllDatabaseIds } = await import('./dashboard-registry')
      expect(getAllDatabaseIds()).toEqual([])
    })
  })

  describe('module state isolation', () => {
    it('resets state between dynamic imports after resetModules', async () => {
      const mod1 = await import('./dashboard-registry')
      mod1.registerDashboard('page-1', 'p1', 't1', ['db-1'])
      expect(mod1.getAllDatabaseIds()).toEqual(['db-1'])

      vi.resetModules()

      const mod2 = await import('./dashboard-registry')
      expect(mod2.getAllDatabaseIds()).toEqual([])
    })
  })
})
