import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Shared mocks ──────────────────────────────────────────────────────

const mockAct = vi.fn()

vi.mock('@mozaik-ai/core', () => ({
  MozaikAgent: class {
    opts: any
    act = mockAct
    constructor(opts: any) { this.opts = opts }
  },
}))

vi.mock('../notion/api', () => ({
  updateEmbed: vi.fn(),
  notifyUser: vi.fn(),
}))

vi.mock('../notion/mcp', () => ({
  getNotionMcpTools: vi.fn(),
}))

vi.mock('../spektrum/client', () => ({
  spektrumRefineTool: { invoke: vi.fn() },
}))

vi.mock('../lib/dashboard-registry', () => ({
  getDashboard: vi.fn(),
}))

// ── Imports (mocked modules above) ────────────────────────────────────
import * as notionApi from '../notion/api'
import * as notionMcp from '../notion/mcp'
import * as spektrumClient from '../spektrum/client'
import * as dashboardRegistry from '../lib/dashboard-registry'

type AnyFn = (...args: any[]) => any
const mockFn = (fn: AnyFn) => fn as unknown as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────

const commentResult = {
  data: { userComment: 'Make the charts bigger' },
}

const inputWithUserId = {
  pageId: 'page-1',
  userId: 'user-1',
}

const inputWithoutUserId = {
  pageId: 'page-1',
}

describe('workflows/refine', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFn(notionMcp.getNotionMcpTools).mockResolvedValue([
      { name: 'API-get-block-children', invoke: vi.fn() },
    ])
    mockFn(dashboardRegistry.getDashboard).mockReturnValue({
      projectId: 'proj-1',
      taskId: 'task-1',
      databaseIds: ['db-1'],
    })
    mockFn(spektrumClient.spektrumRefineTool.invoke).mockResolvedValue({
      appUrl: 'https://refined.example.com',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw when getDashboard returns undefined', async () => {
    mockFn(dashboardRegistry.getDashboard).mockReturnValue(undefined)

    const { runRefineWorkflow } = await import('../workflows/refine')
    await expect(runRefineWorkflow(inputWithUserId)).rejects.toThrow(
      'No dashboard registered for page page-1',
    )
  })

  it('should call spektrumRefineTool.invoke with correct args (project_id, task_id, comment, author_id)', async () => {
    mockAct.mockResolvedValueOnce(commentResult)

    const { runRefineWorkflow } = await import('../workflows/refine')
    await runRefineWorkflow(inputWithUserId)

    expect(mockFn(spektrumClient.spektrumRefineTool.invoke)).toHaveBeenCalledWith({
      project_id: 'proj-1',
      task_id: 'task-1',
      comment: 'Make the charts bigger',
      author_id: 'page-1',
    })
  })

  it('should call updateEmbed with pageId and new appUrl', async () => {
    mockAct.mockResolvedValueOnce(commentResult)

    const { runRefineWorkflow } = await import('../workflows/refine')
    await runRefineWorkflow(inputWithUserId)

    expect(mockFn(notionApi.updateEmbed)).toHaveBeenCalledWith('page-1', 'https://refined.example.com')
  })

  it('should call notifyUser only when userId is truthy', async () => {
    mockAct.mockResolvedValueOnce(commentResult)

    const { runRefineWorkflow } = await import('../workflows/refine')
    await runRefineWorkflow(inputWithUserId)

    expect(mockFn(notionApi.notifyUser)).toHaveBeenCalledWith(
      'page-1',
      'user-1',
      expect.stringContaining('has been refined'),
    )
  })

  it('should NOT call notifyUser when userId is undefined', async () => {
    mockAct.mockResolvedValueOnce(commentResult)

    const { runRefineWorkflow } = await import('../workflows/refine')
    await runRefineWorkflow(inputWithoutUserId)

    expect(mockFn(notionApi.notifyUser)).not.toHaveBeenCalled()
  })

  it('should return { appUrl }', async () => {
    mockAct.mockResolvedValueOnce(commentResult)

    const { runRefineWorkflow } = await import('../workflows/refine')
    const result = await runRefineWorkflow(inputWithUserId)

    expect(result).toEqual({ appUrl: 'https://refined.example.com' })
  })
})
