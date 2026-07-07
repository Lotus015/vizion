import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mock the workflow module — vi.hoisted ensures fn exists before hoisted mock
// ---------------------------------------------------------------------------
const { mockRunRefineWorkflow } = vi.hoisted(() => ({
  mockRunRefineWorkflow: vi.fn().mockResolvedValue({ appUrl: 'https://app.example.com' }),
}))

vi.mock('../../src/workflows/refine', () => ({
  runRefineWorkflow: mockRunRefineWorkflow,
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { refineRoute } from '../../src/routes/refine'

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

describe('refineRoute', () => {
  const pageId = 'page-abc-123'

  it('responds with 202 and a confirmation message, then calls runRefineWorkflow', async () => {
    const userId = 'user-xyz'
    const req = mockReq({ data: { id: pageId }, source: { user_id: userId } })
    const res = mockRes()

    await refineRoute(req, res)

    // Immediate 202 response
    expect(res.status).toHaveBeenCalledWith(202)
    expect(res.json).toHaveBeenCalledWith({
      ok: true,
      message: 'Dashboard refinement started',
    })

    // Workflow called with correct args — no proxyBaseUrl
    expect(mockRunRefineWorkflow).toHaveBeenCalledWith({
      pageId,
      userId,
    })
  })

  it('passes userId as undefined when source.user_id is missing (no ?? "vizion")', async () => {
    const req = mockReq({ data: { id: pageId } })
    const res = mockRes()

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(202)
    expect(mockRunRefineWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ userId: undefined }),
    )
  })

  it('returns 400 when pageId is missing', async () => {
    const req = mockReq({ data: {} })
    const res = mockRes()

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(res.json).toHaveBeenCalledWith({
      error: 'Missing page_id',
      received: { data: {} },
    })
    expect(mockRunRefineWorkflow).not.toHaveBeenCalled()
  })

  it('returns 400 when body is completely empty', async () => {
    const req = mockReq({})
    const res = mockRes()

    await refineRoute(req, res)

    expect(res.status).toHaveBeenCalledWith(400)
    expect(mockRunRefineWorkflow).not.toHaveBeenCalled()
  })

  it('does not throw synchronously when runRefineWorkflow rejects', async () => {
    mockRunRefineWorkflow.mockRejectedValueOnce(new Error('workflow failed'))

    const req = mockReq({ data: { id: pageId }, source: { user_id: 'user-xyz' } })
    const res = mockRes()

    await expect(refineRoute(req, res)).resolves.toBeUndefined()

    expect(res.status).toHaveBeenCalledWith(202)
    expect(mockRunRefineWorkflow).toHaveBeenCalled()
  })
})
