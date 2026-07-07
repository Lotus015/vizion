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
  notifyUser: vi.fn(),
  retrieveDatabaseSchema: vi.fn(),
  queryDatabase: vi.fn(),
}))

vi.mock('../notion/mcp', () => ({
  getNotionMcpTools: vi.fn(),
  getNotionMcpTool: vi.fn(),
}))

vi.mock('../spektrum/client', () => ({
  spektrumGenerateTool: { invoke: vi.fn() },
}))

vi.mock('../lib/dashboard-registry', () => ({
  registerDashboard: vi.fn(),
}))

// ── Imports (mocked modules above) ────────────────────────────────────
import { MozaikAgent } from '@mozaik-ai/core'
import * as notionApi from '../notion/api'
import * as notionMcp from '../notion/mcp'
import * as spektrumClient from '../spektrum/client'
import * as dashboardRegistry from '../lib/dashboard-registry'

type AnyFn = (...args: any[]) => any
const mockFn = (fn: AnyFn) => fn as unknown as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────

const scanResult = {
  data: {
    databases: [{ id: 'db-1', name: 'Customers' }],
    pageTitle: 'My Dashboard Page',
  },
}

const analysisResult = {
  data: {
    dashboardName: 'Customer Dashboard',
    databases: [{ id: 'db-1', name: 'Customers', columnSummary: 'Name, Email, MRR', keyInsights: 'Top customers' }],
    relationships: 'Single database',
    recommendedVisualizations: [
      { title: 'MRR Trend', type: 'line', databases: ['db-1'], description: 'MRR over time' },
    ],
  },
}

const designResult = {
  data: { taskDescription: 'Build a dashboard showing customer metrics.' },
}

const input = {
  pageId: 'page-1',
  userId: 'user-1',
  proxyBaseUrl: 'http://test',
  refineWebhookUrl: 'http://test/refine',
}

describe('workflows/generate', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFn(notionMcp.getNotionMcpTools).mockResolvedValue([
      { name: 'API-get-block-children', invoke: vi.fn() },
    ])
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: vi.fn() })
    mockFn(notionApi.retrieveDatabaseSchema).mockResolvedValue({
      database_id: 'db-1',
      name: 'Customers',
      columns: { Name: { type: 'title' }, MRR: { type: 'number' } },
    })
    mockFn(notionApi.queryDatabase).mockResolvedValue({
      rows: [{ id: 'r1', Name: 'Alice', MRR: 100 }],
      total: 1,
    })
    mockFn(spektrumClient.spektrumGenerateTool.invoke).mockResolvedValue({
      appUrl: 'https://app.example.com',
      projectId: 'proj-1',
      taskId: 'task-1',
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should throw when scan finds no databases', async () => {
    mockAct.mockResolvedValueOnce({ data: { databases: [], pageTitle: 'Empty' } })

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await expect(runGenerateWorkflow(input)).rejects.toThrow('No databases found on page.')
  })

  it('should throw when all database ids are falsy', async () => {
    mockAct.mockResolvedValueOnce({ data: { databases: [{ id: '', name: 'Bad' }], pageTitle: 'Empty' } })

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await expect(runGenerateWorkflow(input)).rejects.toThrow('No databases found on page.')
  })

  it('should call parseAgentResult and feed downstream agents', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    const result = await runGenerateWorkflow(input)

    expect(result.dashboardName).toBe('Customer Dashboard')
    expect(result.appUrl).toBe('https://app.example.com')
  })

  it('should truncate taskDescription to 3000 characters when longer', async () => {
    const longDesc = 'A'.repeat(4000)
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce({ data: { taskDescription: longDesc } })

    const { runGenerateWorkflow } = await import('../workflows/generate')
    const result = await runGenerateWorkflow(input)

    expect(result.dashboardName).toBe('Customer Dashboard')
    // spektrumGenerateTool.invoke should have been called with task_description truncated to 3000
    const invokeArg = mockFn(spektrumClient.spektrumGenerateTool.invoke).mock.calls[0][0]
    expect(invokeArg.task_description).toHaveLength(3000)
  })

  it('should build unifiedDataUrl and sseStreamUrl from proxyBaseUrl', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await runGenerateWorkflow(input)

    // The data URL is injected into the architect's prompt (3rd act call)
    const architectPrompt = mockAct.mock.calls[2][0]
    expect(architectPrompt).toContain('http://test/api/data?databaseId=db-1')
  })

  it('should invoke spektrumGenerateTool with correct args (owner, task_title, task_description)', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await runGenerateWorkflow(input)

    expect(mockFn(spektrumClient.spektrumGenerateTool.invoke)).toHaveBeenCalledWith({
      owner: 'user-1',
      task_title: 'Customer Dashboard',
      task_description: expect.stringContaining('Build a dashboard showing customer metrics.'),
    })
  })

  it('should call getNotionMcpTool("API-patch-block-children") and invoke it with embed block children', async () => {
    const patchInvoke = vi.fn()
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: patchInvoke })
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await runGenerateWorkflow(input)

    expect(mockFn(notionMcp.getNotionMcpTool)).toHaveBeenCalledWith('API-patch-block-children')
    expect(patchInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        block_id: 'page-1',
        children: expect.arrayContaining([
          expect.objectContaining({ type: 'embed' }),
        ]),
      }),
    )
  })

  it('should call registerDashboard with pageId, projectId, taskId, and db ids', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await runGenerateWorkflow(input)

    expect(mockFn(dashboardRegistry.registerDashboard)).toHaveBeenCalledWith(
      'page-1',
      'proj-1',
      'task-1',
      ['db-1'],
    )
  })

  it('should call notifyUser with pageId, userId, and success message', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    await runGenerateWorkflow(input)

    expect(mockFn(notionApi.notifyUser)).toHaveBeenCalledWith(
      'page-1',
      'user-1',
      expect.stringContaining('is ready'),
    )
  })

  it('should return the expected shape { appUrl, projectId, taskId, dashboardName }', async () => {
    mockAct
      .mockResolvedValueOnce(scanResult)
      .mockResolvedValueOnce(analysisResult)
      .mockResolvedValueOnce(designResult)

    const { runGenerateWorkflow } = await import('../workflows/generate')
    const result = await runGenerateWorkflow(input)

    expect(result).toMatchObject({
      appUrl: 'https://app.example.com',
      projectId: 'proj-1',
      taskId: 'task-1',
      dashboardName: 'Customer Dashboard',
    })
  })
})
