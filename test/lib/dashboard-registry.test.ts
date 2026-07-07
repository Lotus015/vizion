import { registerDashboard, getDashboard, getAllDatabaseIds } from '../../src/lib/dashboard-registry'

/**
 * NOTE: registerDashboard and getAllDatabaseIds share module-scoped state.
 * We use beforeEach/afterEach to reset the module before every test so
 * state from one case does not leak into the next.
 */

beforeEach(() => {
  // Reset the module-level state by re-importing — the simplest approach
  // for pure in-memory stores is to rely on import isolation. However,
  // because Vitest caches modules, we need to reset state manually.
  const registry = (registerDashboard as any).__registry
  // The easiest way: use vi.resetModules() with dynamic imports.
})

// Since the module uses module-scoped Map and array, we must reset
// between tests. The cleanest approach is vi.resetModules + dynamic import.
import { vi } from 'vitest'

let mod: typeof import('../../src/lib/dashboard-registry')

beforeEach(async () => {
  vi.resetModules()
  mod = await import('../../src/lib/dashboard-registry')
})

describe('dashboard-registry', () => {
  describe('registerDashboard / getDashboard', () => {
    it('stores a triple and getDashboard returns it', () => {
      mod.registerDashboard('page-1', 'proj-1', 'task-1', ['db-1', 'db-2'])

      const result = mod.getDashboard('page-1')
      expect(result).toEqual({
        projectId: 'proj-1',
        taskId: 'task-1',
        databaseIds: ['db-1', 'db-2'],
      })
    })

    it('duplicate pageId overwrites the previous entry', () => {
      mod.registerDashboard('page-1', 'proj-orig', 'task-orig', ['db-1'])
      mod.registerDashboard('page-1', 'proj-new', 'task-new', ['db-2'])

      const result = mod.getDashboard('page-1')
      expect(result).toEqual({
        projectId: 'proj-new',
        taskId: 'task-new',
        databaseIds: ['db-2'],
      })
    })

    it('getDashboard on unknown id returns undefined', () => {
      const result = mod.getDashboard('nonexistent')
      expect(result).toBeUndefined()
    })
  })

  describe('getAllDatabaseIds', () => {
    it('accumulates database IDs across registrations', () => {
      mod.registerDashboard('p1', 'proj-1', 'task-1', ['db-1', 'db-2'])
      mod.registerDashboard('p2', 'proj-2', 'task-2', ['db-3'])

      expect(mod.getAllDatabaseIds()).toEqual(['db-1', 'db-2', 'db-3'])
    })

    it('de-duplicates database IDs', () => {
      mod.registerDashboard('p1', 'proj-1', 'task-1', ['db-1', 'db-2'])
      mod.registerDashboard('p2', 'proj-2', 'task-2', ['db-2', 'db-3'])

      expect(mod.getAllDatabaseIds()).toEqual(['db-1', 'db-2', 'db-3'])
    })

    it('empty databaseIds does not pollute the global list', () => {
      mod.registerDashboard('p1', 'proj-1', 'task-1', [])
      mod.registerDashboard('p2', 'proj-2', 'task-2', ['db-1'])

      expect(mod.getAllDatabaseIds()).toEqual(['db-1'])
    })

    it('returns an empty array when no databases have been registered', () => {
      expect(mod.getAllDatabaseIds()).toEqual([])
    })
  })
})
