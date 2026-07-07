import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const createDatabaseRow = vi.fn()
vi.mock('../notion/api', () => ({ createDatabaseRow }))

const { dataCreateRoute } = await import('./data-create')

describe('dataCreateRoute', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns 201 with ok:true and id on success', async () => {
    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Alice' } })
    const res = mockRes()

    createDatabaseRow.mockResolvedValue({ id: 'new-page-1' })

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(201)
    expect(res.json).toHaveBeenCalledWith({ ok: true, id: 'new-page-1' })
  })

  it('sets CORS header', async () => {
    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Alice' } })
    const res = mockRes()

    createDatabaseRow.mockResolvedValue({ id: 'new-page-1' })

    await dataCreateRoute(req, res)

    expect(res.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*')
  })

  it('returns 400 when databaseId is missing', async () => {
    const req = mockReq({ properties: { Name: 'Alice' } })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, properties',
    })
  })

  it('returns 400 when properties is missing', async () => {
    const req = mockReq({ databaseId: 'db-1' })
    const res = mockRes()

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing required fields: databaseId, properties',
    })
  })

  it('returns 500 when createDatabaseRow rejects', async () => {
    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Alice' } })
    const res = mockRes()

    createDatabaseRow.mockRejectedValue(new Error('Create failed'))

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await dataCreateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(500)
    expect(res.json).toHaveBeenCalledWith({ error: 'Create failed' })

    consoleErrorSpy.mockRestore()
  })

  it('calls createDatabaseRow with correct args', async () => {
    const req = mockReq({ databaseId: 'db-1', properties: { Name: 'Alice', Email: 'a@b.com' } })
    const res = mockRes()

    createDatabaseRow.mockResolvedValue({ id: 'new-page-1' })

    await dataCreateRoute(req, res)

    expect(createDatabaseRow).toHaveBeenCalledWith('db-1', { Name: 'Alice', Email: 'a@b.com' })
  })
})
