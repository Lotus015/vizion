import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the workflow module — vi.hoisted ensures fn exists before hoisted mock
// ---------------------------------------------------------------------------
const { mockRunFormWorkflow } = vi.hoisted(() => ({
  mockRunFormWorkflow: vi.fn().mockResolvedValue({ appUrl: 'https://app.example.com' }),
}))

vi.mock('../../src/workflows/form', () => ({
  runFormWorkflow: mockRunFormWorkflow,
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { generateFormRoute } from '../../src/routes/generate-form'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockReq(body: unknown) {
  return { body } as any
}

function mockRes() {
  const state: { statusCode?: number; jsonBody?: unknown } = {}
  return {
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
beforeAll(() => {
  process.env.VIZION_BASE_URL = 'http://localhost:3000'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('generateFormRoute', () => {
  const pageId = 'page-abc-123'
  const userId = 'user-xyz'

  it('responds with 202 and a confirmation message, then calls runFormWorkflow', async () => {
    const req = mockReq({ data: { id: pageId }, source: { user_id: userId } })
    const res = mockRes()

    await generateFormRoute(req, res)

    // Immediate 202 response
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: 'Form generation started',
    })

    // Workflow called with correct args
    expect(mockRunFormWorkflow).toHaveBeenCalledWith({
      pageId,
      userId,
      proxyBaseUrl: 'http://localhost:3000',
    })
  })

  it('defaults userId to "vizion" when source.user_id is missing', async () => {
    const req = mockReq({ data: { id: pageId } })
    const res = mockRes()

    await generateFormRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(mockRunFormWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'vizion' }),
    )
  })

  it('returns 400 when pageId is missing', async () => {
    const req = mockReq({ data: {} })
    const res = mockRes()

    await generateFormRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing page_id in webhook payload',
      received: { data: {} },
    })
    expect(mockRunFormWorkflow).not.toHaveBeenCalled()
  })

  it('returns 400 when body is completely empty', async () => {
    const req = mockReq({})
    const res = mockRes()

    await generateFormRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockRunFormWorkflow).not.toHaveBeenCalled()
  })

  it('does not throw synchronously when runFormWorkflow rejects', async () => {
    mockRunFormWorkflow.mockRejectedValueOnce(new Error('workflow failed'))

    const req = mockReq({ data: { id: pageId }, source: { user_id: userId } })
    const res = mockRes()

    await expect(generateFormRoute(req, res)).resolves.toBeUndefined()

    expect(res.status).toHaveBeenCalledWith(202)
    expect(mockRunFormWorkflow).toHaveBeenCalled()
  })
})
