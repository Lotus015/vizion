import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so they exist before vi.mock runs
// ---------------------------------------------------------------------------
const { mockNotionClient, mockNormalizeRows, mockGetAllDatabaseIds } = vi.hoisted(() => {
  const mockClient = {
    databases: {
      retrieve: vi.fn(),
      query: vi.fn(),
    },
  }
  return {
    mockNotionClient: mockClient,
    mockNormalizeRows: vi.fn(),
    mockGetAllDatabaseIds: vi.fn(),
  }
})

vi.mock('../../src/notion/api', () => ({
  notion: vi.fn(() => mockNotionClient),
}))

vi.mock('../../src/notion/normalize', () => ({
  normalizeRows: mockNormalizeRows,
}))

vi.mock('../../src/lib/dashboard-registry', () => ({
  getAllDatabaseIds: mockGetAllDatabaseIds,
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { dataRoute } from '../../src/routes/data'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(query: Record<string, unknown> = {}) {
  return {
    method: 'GET',
    query,
  } as any
}

function mockRes() {
  const state: { statusCode?: number; jsonBody?: unknown; headers: Record<string, string> } = {
    headers: {},
  }
  return {
    setHeader: vi.fn((k: string, v: string) => { state.headers[k] = v }),
    status: vi.fn(function (this: any, code: number) {
      state.statusCode = code
      return this
    }),
    json: vi.fn((body: unknown) => {
      state.jsonBody = body
    }),
    end: vi.fn(),
    _state: state,
  }
}

function makeSchema(name: string) {
  return { title: [{ plain_text: name }] }
}

function makeQueryResult(rows: any[]) {
  return { results: rows }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
})

describe('dataRoute', () => {
  it('returns Access-Control-Allow-Origin header', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('Test DB'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([]))
    mockNormalizeRows.mockReturnValue([])

    await dataRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
  })

  it('returns 200 and datasets for a single databaseId', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('My Table'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([{ id: 'r1' }]))
    mockNormalizeRows.mockReturnValue([{ id: 'r1', name: 'hello' }])

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res._state.jsonBody).toMatchObject({
      my_table: [{ id: 'r1', name: 'hello' }],
      _meta: expect.objectContaining({
        databases: expect.objectContaining({
          my_table: expect.objectContaining({ total: 1, originalName: 'My Table' }),
        }),
      }),
    })
  })

  it('handles multiple databaseIds as an array', async () => {
    const req = mockReq({ databaseId: ['db-1', 'db-2'] })
    const res = mockRes()

    mockNotionClient.databases.retrieve
      .mockResolvedValueOnce(makeSchema('Customers'))
      .mockResolvedValueOnce(makeSchema('Orders'))
    mockNotionClient.databases.query
      .mockResolvedValueOnce(makeQueryResult([{ id: 'c1' }]))
      .mockResolvedValueOnce(makeQueryResult([{ id: 'o1' }, { id: 'o2' }]))
    mockNormalizeRows
      .mockReturnValueOnce([{ id: 'c1', name: 'Alice' }])
      .mockReturnValueOnce([{ id: 'o1', total: 10 }, { id: 'o2', total: 20 }])

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res._state.jsonBody as Record<string, any>
    expect(body.customers).toEqual([{ id: 'c1', name: 'Alice' }])
    expect(body.orders).toEqual([{ id: 'o1', total: 10 }, { id: 'o2', total: 20 }])
    expect(body._meta.databases.customers.total).toBe(1)
    expect(body._meta.databases.orders.total).toBe(2)
  })

  it('falls back to getAllDatabaseIds when no databaseId query param', async () => {
    mockGetAllDatabaseIds.mockReturnValue(['fallback-1', 'fallback-2'])

    const req = mockReq({})
    const res = mockRes()

    mockNotionClient.databases.retrieve
      .mockResolvedValueOnce(makeSchema('A'))
      .mockResolvedValueOnce(makeSchema('B'))
    mockNotionClient.databases.query
      .mockResolvedValueOnce(makeQueryResult([]))
      .mockResolvedValueOnce(makeQueryResult([]))
    mockNormalizeRows.mockReturnValue([])

    await dataRoute(req, res)

    expect(mockGetAllDatabaseIds).toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(200)
  })

  it('returns 400 when no databaseId and no fallback', async () => {
    mockGetAllDatabaseIds.mockReturnValue([])

    const req = mockReq({})
    const res = mockRes()

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'At least one databaseId required' })
  })

  it('derives cleanName by stripping .csv and replacing special chars', async () => {
    const req = mockReq({ databaseId: 'db-csv' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('customers.csv'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([]))
    mockNormalizeRows.mockReturnValue([])

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res._state.jsonBody as Record<string, any>
    // "customers.csv" → cleanName: remove .csv → "customers"
    expect(body.customers).toBeDefined()
    expect(body._meta.databases.customers.originalName).toBe('customers.csv')
  })

  it('includes _meta block with lastUpdated and databases', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('Test'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([{ id: 'r1' }]))
    mockNormalizeRows.mockReturnValue([{ id: 'r1' }])

    await dataRoute(req, res)

    const body = res._state.jsonBody as Record<string, any>
    expect(body._meta).toBeDefined()
    expect(body._meta.lastUpdated).toEqual(expect.any(String))
    expect(body._meta.databases).toBeDefined()
    expect(body._meta.databases.test).toEqual({
      databaseId: 'db-1',
      total: 1,
      originalName: 'Test',
    })
  })

  it('returns 500 when notion API throws', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockRejectedValue(new Error('Notion API down'))

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Notion API down' })
  })

  it('returns 200 on OPTIONS preflight', async () => {
    const req = { method: 'OPTIONS', query: {} } as any
    const res = mockRes()

    await dataRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('uses databaseId as name fallback when schema has no title', async () => {
    const req = mockReq({ databaseId: 'db-42' })
    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue({ title: [] })
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([]))
    mockNormalizeRows.mockReturnValue([])

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    const body = res._state.jsonBody as Record<string, any>
    // cleanName('db-42') = 'db_42'
    expect(body.db_42).toBeDefined()
  })
})
