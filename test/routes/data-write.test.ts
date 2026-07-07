import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so they exist before vi.mock runs
// ---------------------------------------------------------------------------
const { mockUpdateDatabaseRow } = vi.hoisted(() => ({
  mockUpdateDatabaseRow: vi.fn(),
}))

vi.mock('../../src/notion/api', () => ({
  updateDatabaseRow: mockUpdateDatabaseRow,
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { dataWriteRoute } from '../../src/routes/data-write'

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

describe('dataWriteRoute', () => {
  it('returns 200 with {ok:true} on successful update', async () => {
    mockUpdateDatabaseRow.mockResolvedValue(undefined)

    const req = mockReq({ databaseId: 'db-1', pageId: 'page-1', properties: { Name: 'Updated' } })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
    expect(mockUpdateDatabaseRow).toHaveBeenCalledWith('db-1', 'page-1', { Name: 'Updated' })
  })

  it('returns 400 when databaseId is missing', async () => {
    const req = mockReq({ pageId: 'page-1', properties: { Name: 'Test' } })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
    expect(mockUpdateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 400 when pageId is missing', async () => {
    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Test' } })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
    expect(mockUpdateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 400 when properties is missing', async () => {
    const req = mockReq({ databaseId: 'db-1', pageId: 'page-1' })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
    expect(mockUpdateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 400 when body is empty', async () => {
    const req = mockReq({})
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockUpdateDatabaseRow).not.toHaveBeenCalled()
  })

  it('returns 500 and error message when updateDatabaseRow rejects', async () => {
    mockUpdateDatabaseRow.mockRejectedValue(new Error('Update failed'))

    const req = mockReq({ databaseId: 'db-1', pageId: 'page-1', properties: { Name: 'Test' } })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' })
  })
})
