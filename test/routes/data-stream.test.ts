import { vi } from 'vitest'
import { EventEmitter } from 'events'

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
import { dataStreamRoute } from '../../src/routes/data-stream'

// ---------------------------------------------------------------------------
// Constants from source (must match)
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 5_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockRes() {
  const state: {
    headers: Record<string, string>
    written: string[]
    statusCode?: number
    jsonBody?: unknown
  } = {
    headers: {},
    written: [],
  }
  return {
    setHeader: vi.fn((k: string, v: string) => { state.headers[k] = v }),
    status: vi.fn(function (this: any, code: number) { state.statusCode = code; return this }),
    json: vi.fn((body: unknown) => { state.jsonBody = body }),
    flushHeaders: vi.fn(),
    write: vi.fn((chunk: string) => { state.written.push(chunk) }),
    end: vi.fn(),
    getHeader: (k: string) => state.headers[k],
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
  vi.useFakeTimers()
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('dataStreamRoute', () => {
  it('sets SSE headers and sends initial data frame', async () => {
    const req = new EventEmitter() as any
    req.query = { databaseId: 'db-1' }

    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('Live Table'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([{ id: 'r1', name: 'hello' }]))
    mockNormalizeRows.mockReturnValue([{ id: 'r1', name: 'hello' }])

    // dataStreamRoute is async — let it run
    const promise = dataStreamRoute(req, res)

    // Let the initial fetchAndPush complete
    await vi.advanceTimersByTimeAsync(0)

    // Assert SSE headers
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache')
    expect(res.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive')
    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.flushHeaders).toHaveBeenCalled()

    // Assert initial data frame was written
    expect(res._state.written.length).toBe(1)
    const frame = res._state.written[0]
    expect(frame).toMatch(/^data: /u)
    const parsed = JSON.parse(frame.replace(/^data: /, '').replace(/\n\n$/, '').trim())
    expect(parsed.live_table).toEqual([{ id: 'r1', name: 'hello' }])
    expect(parsed._meta).toBeDefined()

    // Clean up — emit close to clear interval
    req.emit('close')
    await promise
  })

  it('does NOT write a second frame when data hash is unchanged', async () => {
    const req = new EventEmitter() as any
    req.query = { databaseId: 'db-1' }

    const res = mockRes()

    const rows = [{ id: 'r1', name: 'hello' }]

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('T'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([...rows]))
    mockNormalizeRows.mockReturnValue(rows)

    const promise = dataStreamRoute(req, res)
    await vi.advanceTimersByTimeAsync(0)

    // First write happened
    const writesAfterInitial = res._state.written.length
    expect(writesAfterInitial).toBe(1)

    // Advance one poll interval — data hasn't changed so no new write
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    expect(res._state.written.length).toBe(1)

    // Clean up
    req.emit('close')
    await promise
  })

  it('writes a new frame when data changes', async () => {
    const req = new EventEmitter() as any
    req.query = { databaseId: 'db-1' }

    const res = mockRes()

    const rows1 = [{ id: 'r1', name: 'hello' }]
    const rows2 = [{ id: 'r1', name: 'hello' }, { id: 'r2', name: 'world' }]

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('T'))
    mockNotionClient.databases.query
      .mockResolvedValueOnce(makeQueryResult([...rows1]))
      .mockResolvedValueOnce(makeQueryResult([...rows2]))
    mockNormalizeRows
      .mockReturnValueOnce(rows1)
      .mockReturnValueOnce(rows2)

    const promise = dataStreamRoute(req, res)
    await vi.advanceTimersByTimeAsync(0)

    expect(res._state.written.length).toBe(1)

    // Advance one poll interval — data changed, new frame
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    expect(res._state.written.length).toBe(2)
    const secondFrame = res._state.written[1]
    expect(secondFrame).toMatch(/^data: /u)
    const parsed = JSON.parse(secondFrame.replace(/^data: /, '').replace(/\n\n$/, '').trim())
    expect(parsed.t).toEqual(rows2)

    // Clean up
    req.emit('close')
    await promise
  })

  it('writes an error frame when Notion API fails', async () => {
    const req = new EventEmitter() as any
    req.query = { databaseId: 'db-1' }

    const res = mockRes()

    mockNotionClient.databases.retrieve.mockRejectedValue(new Error('Notion unreachable'))

    const promise = dataStreamRoute(req, res)
    await vi.advanceTimersByTimeAsync(0)

    // Error frame written
    expect(res._state.written.length).toBe(1)
    const errorFrame = res._state.written[0]
    expect(errorFrame).toMatch(/^event: error\ndata: /u)
    const parsed = JSON.parse(errorFrame.replace(/^event: error\ndata: /, '').replace(/\n\n$/, '').trim())
    expect(parsed.error).toBe('Notion unreachable')

    // Clean up
    req.emit('close')
    await promise
  })

  it('clears the interval when req emits close', async () => {
    const req = new EventEmitter() as any
    req.query = { databaseId: 'db-1' }

    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('T'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([{ id: 'r1' }]))
    mockNormalizeRows.mockReturnValue([{ id: 'r1' }])

    const promise = dataStreamRoute(req, res)
    await vi.advanceTimersByTimeAsync(0)

    expect(res._state.written.length).toBe(1)

    // Emit close to kill the interval
    req.emit('close')

    // Advance past poll interval — no new writes because interval is cleared
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3)

    expect(res._state.written.length).toBe(1)

    await promise
  })

  it('returns 400 when no databaseId and no fallback', async () => {
    mockGetAllDatabaseIds.mockReturnValue([])

    const req = new EventEmitter() as any
    req.query = {}

    const res = mockRes()

    // No await — this route returns immediately for 400
    await dataStreamRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'At least one databaseId required' })
  })

  it('falls back to getAllDatabaseIds when no query param', async () => {
    mockGetAllDatabaseIds.mockReturnValue(['db-fallback'])

    const req = new EventEmitter() as any
    req.query = {}

    const res = mockRes()

    mockNotionClient.databases.retrieve.mockResolvedValue(makeSchema('Fallback DB'))
    mockNotionClient.databases.query.mockResolvedValue(makeQueryResult([]))
    mockNormalizeRows.mockReturnValue([])

    const promise = dataStreamRoute(req, res)
    await vi.advanceTimersByTimeAsync(0)

    expect(mockGetAllDatabaseIds).toHaveBeenCalled()
    expect(res.flushHeaders).toHaveBeenCalled()
    expect(res._state.written.length).toBe(1)

    req.emit('close')
    await promise
  })
})
