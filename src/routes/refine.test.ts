import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const runRefineWorkflow = vi.fn()
vi.mock('../workflows/refine', () => ({ runRefineWorkflow }))

const { refineRoute } = await import('./refine')

describe('refineRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
    runRefineWorkflow.mockResolvedValue({ appUrl: 'https://app' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    runRefineWorkflow.mockReset()
  })

  it('returns 202 with ok:true on valid payload', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Dashboard refinement started' })
  })

  it('defaults userId to undefined when source.user_id is not provided', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runRefineWorkflow.mockResolvedValue({ appUrl: 'https://app' })

    await refineRoute(req, res)

    expect(runRefineWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined })
    )
  })

  it('uses source.user_id when provided', async () => {
    const req = mockReq({ data: { id: 'page-123' }, source: { user_id: 'user-abc' } })
    const res = mockRes()

    runRefineWorkflow.mockResolvedValue({ appUrl: 'https://app' })

    await refineRoute(req, res)

    expect(runRefineWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' })
    )
  })

  it('passes pageId to the workflow', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runRefineWorkflow.mockResolvedValue({ appUrl: 'https://app' })

    await refineRoute(req, res)

    expect(runRefineWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ pageId: 'page-123' })
    )
  })

  it('returns 400 when pageId is missing, echoes received body', async () => {
    const req = mockReq({})
    const res = mockRes()

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing page_id',
      received: {},
    })
  })

  it('logs background rejection without throwing', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    const err = new Error('boom')
    runRefineWorkflow.mockRejectedValue(err)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })
})
