// ---------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// ---------------------------------------------------------------------------
vi.mock('@mozaik-ai/core', () => ({
  MozaikAgent: vi.fn(),
  Tool: {},
}))

vi.mock('../../src/notion/mcp', () => ({
  getNotionMcpTools: vi.fn(),
}))

vi.mock('../../src/notion/api', () => ({
  updateEmbed: vi.fn(),
  notifyUser: vi.fn(),
}))

vi.mock('../../src/spektrum/client', () => ({
  spektrumRefineTool: { invoke: vi.fn() },
}))

vi.mock('../../src/mozaik/helpers', () => ({
  parseAgentResult: vi.fn((x: unknown) => {
    const obj = x as any
    return obj?.data ?? x
  }),
}))

vi.mock('../../src/lib/dashboard-registry', () => ({
  getDashboard: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { MozaikAgent } from '@mozaik-ai/core'
import * as mcp from '../../src/notion/mcp'
import * as api from '../../src/notion/api'
import { spektrumRefineTool } from '../../src/spektrum/client'
import * as registry from '../../src/lib/dashboard-registry'
import { runRefineWorkflow } from '../../src/workflows/refine'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const defaultInput = {
  pageId: 'page-refine-1',
  userId: 'user-789',
}

const mockMcpTools = [
  {
    name: 'API-get-block-children',
    description: 'Get block children',
    schema: {},
    invoke: vi.fn(),
  },
]

const mockDashboardRecord = {
  projectId: 'proj-ref-1',
  taskId: 'task-ref-1',
  databaseIds: ['db-ref-1'],
}

const readerResult = {
  data: {
    userComment: 'Please change the color scheme to blue.',
  },
}

const spektrumRefineResult = {
  appUrl: 'https://app.spektrum.dev/refined-dashboard',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runRefineWorkflow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: reads comment, refines with Spektrum, updates embed, notifies user, returns {appUrl}', async () => {
    vi.mocked(registry.getDashboard).mockReturnValue(mockDashboardRecord)
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(spektrumRefineTool.invoke).mockResolvedValue(spektrumRefineResult)
    vi.mocked(api.updateEmbed).mockResolvedValue(undefined)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(readerResult)

    const output = await runRefineWorkflow(defaultInput)

    // ── Dashboard lookup ──────────────────────────────────────────
    expect(registry.getDashboard).toHaveBeenCalledWith('page-refine-1')

    // ── Reader agent gets pageId in its prompt ────────────────────
    expect(actMock.mock.calls[0][0]).toContain('page-refine-1')

    // ── Spektrum refine invoked with correct args ─────────────────
    expect(spektrumRefineTool.invoke).toHaveBeenCalledWith({
      project_id: mockDashboardRecord.projectId,
      task_id: mockDashboardRecord.taskId,
      comment: readerResult.data.userComment,
      author_id: defaultInput.pageId,
    })

    // ── Embed updated ─────────────────────────────────────────────
    expect(api.updateEmbed).toHaveBeenCalledWith(
      defaultInput.pageId,
      spektrumRefineResult.appUrl,
    )

    // ── User notified ─────────────────────────────────────────────
    expect(api.notifyUser).toHaveBeenCalledWith(
      defaultInput.pageId,
      defaultInput.userId,
      expect.stringContaining('refined'),
    )

    // ── Return value ──────────────────────────────────────────────
    expect(output).toEqual({
      appUrl: spektrumRefineResult.appUrl,
    })
  })

  it('throws when getDashboard returns undefined', async () => {
    vi.mocked(registry.getDashboard).mockReturnValue(undefined)

    await expect(runRefineWorkflow(defaultInput)).rejects.toThrow(
      'No dashboard registered for page page-refine-1',
    )
  })

  it('skips notifyUser when userId is undefined', async () => {
    const inputWithoutUser = { pageId: 'page-no-user', userId: undefined as unknown as string }

    vi.mocked(registry.getDashboard).mockReturnValue(mockDashboardRecord)
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(spektrumRefineTool.invoke).mockResolvedValue(spektrumRefineResult)
    vi.mocked(api.updateEmbed).mockResolvedValue(undefined)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(readerResult)

    await runRefineWorkflow(inputWithoutUser)

    // notifyUser should NOT have been called when userId is undefined
    expect(api.notifyUser).not.toHaveBeenCalled()
  })

  it('skips notifyUser when userId is an empty string (falsy)', async () => {
    const inputWithEmptyUser = { pageId: 'page-empty-user', userId: '' }

    vi.mocked(registry.getDashboard).mockReturnValue(mockDashboardRecord)
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(spektrumRefineTool.invoke).mockResolvedValue(spektrumRefineResult)
    vi.mocked(api.updateEmbed).mockResolvedValue(undefined)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(readerResult)

    await runRefineWorkflow({ pageId: 'page-empty-user', userId: '' })

    expect(api.notifyUser).not.toHaveBeenCalled()
  })

  it('calls spektrumRefineTool.invoke with author_id set to pageId', async () => {
    vi.mocked(registry.getDashboard).mockReturnValue(mockDashboardRecord)
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(spektrumRefineTool.invoke).mockResolvedValue(spektrumRefineResult)
    vi.mocked(api.updateEmbed).mockResolvedValue(undefined)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(readerResult)

    await runRefineWorkflow(defaultInput)

    expect(spektrumRefineTool.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        author_id: defaultInput.pageId,
      }),
    )
  })

  it('notifies user when userId is provided', async () => {
    vi.mocked(registry.getDashboard).mockReturnValue(mockDashboardRecord)
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(spektrumRefineTool.invoke).mockResolvedValue(spektrumRefineResult)
    vi.mocked(api.updateEmbed).mockResolvedValue(undefined)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(readerResult)

    const output = await runRefineWorkflow(defaultInput)

    expect(api.notifyUser).toHaveBeenCalledWith(
      defaultInput.pageId,
      defaultInput.userId,
      expect.any(String),
    )
    expect(output).toEqual({ appUrl: spektrumRefineResult.appUrl })
  })
})
