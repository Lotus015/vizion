import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const runBuildWorkflow = vi.fn()
vi.mock('../workflows/build', () => ({ runBuildWorkflow }))

const { buildRoute } = await import('./build')

describe('buildRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
    runBuildWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    runBuildWorkflow.mockReset()
  })

  it('returns 202 with ok:true on valid payload', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    await buildRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'App build started' })
  })

  it('defaults userId to vizion when source.user_id is not provided', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runBuildWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1' })

    await buildRoute(req, res)

    expect(runBuildWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'vizion' })
    )
  })

  it('uses source.user_id when provided', async () => {
    const req = mockReq({ data: { id: 'page-123' }, source: { user_id: 'user-abc' } })
    const res = mockRes()

    runBuildWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1' })

    await buildRoute(req, res)

    expect(runBuildWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' })
    )
  })

  it('passes proxyBaseUrl from VIZION_BASE_URL', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runBuildWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1' })

    await buildRoute(req, res)

    expect(runBuildWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ proxyBaseUrl: 'http://test' })
    )
  })

  it('returns 400 when pageId is missing, echoes received body', async () => {
    const req = mockReq({})
    const res = mockRes()

    await buildRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing page_id in webhook payload',
      received: {},
    })
  })

  it('logs background rejection without throwing', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    const err = new Error('boom')
    runBuildWorkflow.mockRejectedValue(err)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await buildRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })
})
