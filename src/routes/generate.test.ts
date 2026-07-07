import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mockReq, mockRes } from '../test/http'

// Mock the workflow BEFORE importing the route
const runGenerateWorkflow = vi.fn()
vi.mock('../workflows/generate', () => ({ runGenerateWorkflow }))

// Import after mocks are set up
const { generateRoute } = await import('./generate')

describe('generateRoute', () => {
  beforeEach(() => {
    vi.stubEnv('VIZION_BASE_URL', 'http://test')
    // Ensure the mock returns a promise so .then() works
    runGenerateWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', dashboardName: 'dash' })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    runGenerateWorkflow.mockReset()
  })

  it('returns 202 with ok:true on valid payload', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    await generateRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({ ok: true, message: 'Dashboard generation started' })
  })

  it('defaults userId to vizion when source.user_id is not provided', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runGenerateWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', dashboardName: 'dash' })

    await generateRoute(req, res)

    expect(runGenerateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'vizion' })
    )
  })

  it('uses source.user_id when provided', async () => {
    const req = mockReq({ data: { id: 'page-123' }, source: { user_id: 'user-abc' } })
    const res = mockRes()

    runGenerateWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', dashboardName: 'dash' })

    await generateRoute(req, res)

    expect(runGenerateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-abc' })
    )
  })

  it('passes proxyBaseUrl from VIZION_BASE_URL', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runGenerateWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', dashboardName: 'dash' })

    await generateRoute(req, res)

    expect(runGenerateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ proxyBaseUrl: 'http://test' })
    )
  })

  it('passes refineWebhookUrl built from proxyBaseUrl', async () => {
    const req = mockReq({ data: { id: 'page-123' } })
    const res = mockRes()

    runGenerateWorkflow.mockResolvedValue({ appUrl: 'https://app', projectId: 'p1', taskId: 't1', dashboardName: 'dash' })

    await generateRoute(req, res)

    expect(runGenerateWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ refineWebhookUrl: 'http://test/api/refine' })
    )
  })

  it('returns 400 when pageId is missing, echoes received body', async () => {
    const req = mockReq({})
    const res = mockRes()

    await generateRoute(req, res)

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
    runGenerateWorkflow.mockRejectedValue(err)

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await generateRoute(req, res)

    // 202 response still sent synchronously
    expect(res.status).toHaveBeenCalledWith(202)

    // Wait for the background promise to settle
    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalled()
    })

    consoleErrorSpy.mockRestore()
    consoleLogSpy.mockRestore()
  })
})
