import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const updateDatabaseRow = vi.fn()
vi.mock('../notion/api', () => ({ updateDatabaseRow }))

const { dataWriteRoute } = await import('./data-write')

describe('dataWriteRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 200 with ok:true on success', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      pageId: 'page-1',
      properties: { Name: 'Alice' },
    })
    const res = mockRes()

    updateDatabaseRow.mockResolvedValue(undefined)

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.json).toHaveBeenCalledWith({ ok: true })
  })

  it('sets CORS header', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      pageId: 'page-1',
      properties: { Name: 'Alice' },
    })
    const res = mockRes()

    updateDatabaseRow.mockResolvedValue(undefined)

    await dataWriteRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
  })

  it('returns 400 when databaseId is missing', async () => {
    const req = mockReq({
      pageId: 'page-1',
      properties: { Name: 'Alice' },
    })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
  })

  it('returns 400 when pageId is missing', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      properties: { Name: 'Alice' },
    })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
  })

  it('returns 400 when properties is missing', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      pageId: 'page-1',
    })
    const res = mockRes()

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, pageId, properties',
    })
  })

  it('returns 500 when updateDatabaseRow rejects', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      pageId: 'page-1',
      properties: { Name: 'Alice' },
    })
    const res = mockRes()

    updateDatabaseRow.mockRejectedValue(new Error('Update failed'))

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await dataWriteRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Update failed' })

    consoleErrorSpy.mockRestore()
  })

  it('calls updateDatabaseRow with correct args', async () => {
    const req = mockReq({
      databaseId: 'db-1',
      pageId: 'page-1',
      properties: { Name: 'Alice', Email: 'a@b.com' },
    })
    const res = mockRes()

    updateDatabaseRow.mockResolvedValue(undefined)

    await dataWriteRoute(req, res)

    expect(updateDatabaseRow).toHaveBeenCalledWith('db-1', 'page-1', {
      Name: 'Alice',
      Email: 'a@b.com',
    })
  })
})
