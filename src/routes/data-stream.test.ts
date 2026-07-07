import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const mockDatabasesRetrieve = vi.fn()
const mockDatabasesQuery = vi.fn()
const notion = vi.fn(() => ({
  databases: {
    retrieve: mockDatabasesRetrieve,
    query: mockDatabasesQuery,
  },
}))
vi.mock('../notion/api', () => ({ notion }))

const getAllDatabaseIds = vi.fn()
vi.mock('../lib/dashboard-registry', () => ({ getAllDatabaseIds }))

const { dataStreamRoute } = await import('./data-stream')

describe('dataStreamRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('sets SSE headers', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    // Start the SSE stream
    const promise = dataStreamRoute(req, res)

    // Let the initial fetchAndPush complete
    await promise

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.flushHeaders).toHaveBeenCalled()
  })

  it('sends initial data via res.write', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({
      results: [
        { id: 'r1', properties: { Name: { type: 'title', title: [{ plain_text: 'Alice' }] } } },
      ],
    })

    await dataStreamRoute(req, res)

    expect(res.write).toHaveBeenCalledTimes(1)

    const writeArg = res.write.mock.calls[0][0] as string
    expect(writeArg).toMatch(/^data: /)
    expect(writeArg).toMatch(/\n\n$/)
  })

  it('does not write again when data hash is unchanged', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    const rows = [
      { id: 'r1', properties: { Name: { type: 'title', title: [{ plain_text: 'Alice' }] } } },
    ]

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    // Return same data on both calls
    mockDatabasesQuery.mockResolvedValue({ results: rows })

    await dataStreamRoute(req, res)

    // Clear initial write count
    res.write.mockClear()

    // Advance timer to trigger interval poll
    await vi.advanceTimersByTimeAsync(5_000)

    // Should not write because hash is the same
    expect(res.write).not.toHaveBeenCalled()
  })

  it('writes new data when data hash changes', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    const rows1 = [
      { id: 'r1', properties: { Name: { type: 'title', title: [{ plain_text: 'Alice' }] } } },
    ]
    const rows2 = [
      { id: 'r1', properties: { Name: { type: 'title', title: [{ plain_text: 'Alice' }] } } },
      { id: 'r2', properties: { Name: { type: 'title', title: [{ plain_text: 'Bob' }] } } },
    ]

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    // Return different data on second call
    mockDatabasesQuery
      .mockResolvedValueOnce({ results: rows1 })
      .mockResolvedValueOnce({ results: rows2 })

    await dataStreamRoute(req, res)

    // Clear initial write count
    res.write.mockClear()

    // Advance timer to trigger interval poll
    await vi.advanceTimersByTimeAsync(5_000)

    // Should write because hash changed
    expect(res.write).toHaveBeenCalledTimes(1)

    const writeArg = res.write.mock.calls[0][0] as string
    expect(writeArg).toMatch(/^data: /)
  })

  it('calls req.on close callback to clear interval', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataStreamRoute(req, res)

    // Verify on was called with 'close'
    expect(req.on).toHaveBeenCalledWith('close', expect.any(Function))

    // Call the close handler manually
    const closeHandler = req.on.mock.calls.find((c: any[]) => c[0] === 'close')?.[1]
    expect(closeHandler).toBeDefined()

    closeHandler()

    // Advance timer — should not trigger another write because interval was cleared
    res.write.mockClear()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(res.write).not.toHaveBeenCalled()
  })

  it('falls back to getAllDatabaseIds when no databaseId param', async () => {
    const req = mockReq({}, {})
    const res = mockRes()

    getAllDatabaseIds.mockReturnValue(['db-fallback'])

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Fallback DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataStreamRoute(req, res)

    expect(getAllDatabaseIds).toHaveBeenCalled()
  })

  it('returns 400 when no databaseId is available', async () => {
    const req = mockReq({}, {})
    const res = mockRes()

    getAllDatabaseIds.mockReturnValue([])

    await dataStreamRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'At least one databaseId required' })
  })

  it('writes error event on fetch failure', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockRejectedValue(new Error('Network error'))

    await dataStreamRoute(req, res)

    // Initial fetch failed, should write error event
    expect(res.write).toHaveBeenCalledTimes(1)
    const writeArg = res.write.mock.calls[0][0] as string
    expect(writeArg).toMatch(/^event: error/)
    expect(writeArg).toContain('Network error')
  })
})
