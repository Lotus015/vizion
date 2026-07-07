import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

const runFormWorkflow = vi.fn()
vi.mock('../workflows/form', () => ({ runFormWorkflow }))

const { generateFormRoute } = await import('./generate-form')

describe('generateFormRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
    runFormWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', formName: 'form' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    runFormWorkflow.mockReset()
  })

  it('returns 202 with ok:true on valid payload', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    await generateFormRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Form generation started' })
  })

  it('defaults userId to vizion when source.user_id is not provided', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runFormWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', formName: 'form' })

    await generateFormRoute(req, res)

    expect(runFormWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'vizion' })
    )
  })

  it('uses source.user_id when provided', async () => {
    const req = mockReq({ data: { id: 'page-123' }, source: { user_id: 'user-abc' } })
    const res = mockRes()

    runFormWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', formName: 'form' })

    await generateFormRoute(req, res)

    expect(runFormWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' })
    )
  })

  it('passes proxyBaseUrl from VIZION_BASE_URL', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runFormWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', formName: 'form' })

    await generateFormRoute(req, res)

    expect(runFormWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ proxyBaseUrl: 'http://test' })
    )
  })

  it('returns 400 when pageId is missing, echoes received body', async () => {
    const req = mockReq({})
    const res = mockRes()

    await generateFormRoute(req, res)

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
    runFormWorkflow.mockRejectedValue(err)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await generateFormRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })
})
