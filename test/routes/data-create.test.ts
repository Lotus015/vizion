import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so they exist before vi.mock runs
// ---------------------------------------------------------------------------
const { mockCreateDatabaseRow } = vi.hoisted(() => ({
  mockCreateDatabaseRow: vi.fn(),
}))

vi.mock('../../src/notion/api', () => ({
  createDatabaseRow: mockCreateDatabaseRow,
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { dataCreateRoute } from '../../src/routes/data-create'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(body: unknown) {
  return { body } as any
}

function mockRes() {
  const state: { statusCode?: number; jsonBody?: unknown } = {}
  return {
    setHeader: vi.fn(),
    status: vi.fn(function (this: any, code: number) {
      state.statusCode = code
      return this
    }),
    json: vi.fn((body: unknown) => {
      state.jsonBody = body
    }),
    _state: state,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
})

describe('dataCreateRoute', () => {
  it('returns 201 with {ok, id} on successful creation', async () => {
    mockCreateDatabaseRow.mockResolvedValue({ id: 'new-page-123' })

    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Test' } })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'new-page-123' })
    expect(mockCreateDatabaseRow).toHaveBeenCalledWith('db-1', { Name: 'Test' })
  })

  it('returns 400 when databaseId is missing', async () => {
    const req = mockReq({ properties: { Name: 'Test' } })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, properties',
    })
    expect(mockCreateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 400 when properties is missing', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, properties',
    })
    expect(mockCreateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 400 when body is empty', async () => {
    const req = mockReq({})
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockCreateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 500 and error message when createDatabaseRow rejects', async () => {
    mockCreateDatabaseRow.mockRejectedValue(new Error('Notion error'))

    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Test' } })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Notion error' })
  })
})
