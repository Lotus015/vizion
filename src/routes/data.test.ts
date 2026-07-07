import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

// Mock notion/api
const mockDatabasesRetrieve = vi.fn()
const mockDatabasesQuery = vi.fn()
const notion = vi.fn(() => ({
  databases: {
    retrieve: mockDatabasesRetrieve,
    query: mockDatabasesQuery,
  },
}))
vi.mock('../notion/api', () => ({ notion }))

// Mock dashboard-registry
const getAllDatabaseIds = vi.fn()
vi.mock('../lib/dashboard-registry', () => ({ getAllDatabaseIds }))

const { dataRoute } = await import('./data')

describe('dataRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('sets CORS and cache headers', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=25')
  })

  it('handles OPTIONS request', async () => {
    const req = mockReq({}, {}, { method: 'OPTIONS' })
    const res = mockRes()

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.end).toHaveBeenCalled()
  })

  it('uses databaseId from query string (single string)', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataRoute(req, res)

    expect(mockDatabasesRetrieve).toHaveBeenCalledWith({ database_id: 'db-1' })
    expect(mockDatabasesQuery).toHaveBeenCalledWith({ database_id: 'db-1', page_size: 100 })
  })

  it('uses databaseId from query string (array)', async () => {
    const req = mockReq({}, { databaseId: ['db-1', 'db-2'] })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataRoute(req, res)

    expect(mockDatabasesRetrieve).toHaveBeenCalledTimes(2)
    expect(mockDatabasesQuery).toHaveBeenCalledTimes(2)
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

    await dataRoute(req, res)

    expect(getAllDatabaseIds).toHaveBeenCalled()
    expect(mockDatabasesRetrieve).toHaveBeenCalledWith({ database_id: 'db-fallback' })
  })

  it('returns 400 when no databaseId is available', async () => {
    const req = mockReq({}, {})
    const res = mockRes()

    getAllDatabaseIds.mockReturnValue([])

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({ error: 'At least one databaseId required' })
  })

  it('maps cleanName (title → key)', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'customers.csv' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({
      results: [
        { id: 'r1', properties: { Name: { type: 'title', title: [{ plain_text: 'Alice' }] } } },
      ],
    })

    await dataRoute(req, res)

    // The response JSON should have key "customers" (not "customers.csv")
    const responseJson = res.json.mock.calls[0][0]
    expect(responseJson).toHaveProperty('customers')
    expect(responseJson).not.toHaveProperty('customers.csv')
  })

  it('includes _meta with lastUpdated and databases info', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockResolvedValue({
      title: [{ plain_text: 'Test DB' }],
      properties: {},
    })
    mockDatabasesQuery.mockResolvedValue({ results: [] })

    await dataRoute(req, res)

    const responseJson = res.json.mock.calls[0][0]
    expect(responseJson).toHaveProperty('_meta')
    expect(responseJson._meta).toHaveProperty('lastUpdated')
    expect(responseJson._meta).toHaveProperty('databases')
    expect(responseJson._meta.databases).toHaveProperty('test_db')
    expect(responseJson._meta.databases.test_db).toHaveProperty('databaseId', 'db-1')
    expect(responseJson._meta.databases.test_db).toHaveProperty('total', 0)
    expect(responseJson._meta.databases.test_db).toHaveProperty('originalName', 'Test DB')
  })

  it('returns 500 on Notion error', async () => {
    const req = mockReq({}, { databaseId: 'db-1' })
    const res = mockRes()

    mockDatabasesRetrieve.mockRejectedValue(new Error('Notion API error'))

    await dataRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Notion API error' })
  })
})
