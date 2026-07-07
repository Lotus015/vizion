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
  createNotionDatabase: vi.fn(),
}))

vi.mock('../notion/mcp', () => ({
  getNotionMcpTools: vi.fn(),
  getNotionMcpTool: vi.fn(),
}))

vi.mock('../spektrum/client', () => ({
  spektrumGenerateTool: { invoke: vi.fn() },
}))

// ── Imports (mocked modules above) ────────────────────────────────────
import * as notionApi from '../notion/api'
import * as notionMcp from '../notion/mcp'
import * as spektrumClient from '../spektrum/client'

type AnyFn = (...args: any[]) => any
const mockFn = (fn: AnyFn) => fn as unknown as ReturnType<typeof vi.fn>

// ── Fixtures ──────────────────────────────────────────────────────────

const pageContentResult = {
  data: {
    title: 'My App',
    content: 'Build a lead capture app that collects emails and names.',
  },
}

const planWithDatabasesResult = {
  data: {
    needsDatabases: true,
    databases: [
      {
        name: 'Leads',
        columns: [
          { name: 'Name', type: 'title' },
          { name: 'Email', type: 'email' },
        ],
      },
    ],
  },
}

const planWithoutDatabasesResult = {
  data: {
    needsDatabases: false,
    databases: [],
  },
}

const input = {
  pageId: 'page-1',
  userId: 'user-1',
  proxyBaseUrl: 'http://test',
}

describe('workflows/build', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFn(notionMcp.getNotionMcpTools).mockResolvedValue([
      { name: 'API-get-block-children', invoke: vi.fn() },
    ])
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: vi.fn() })
    mockFn(notionApi.createNotionDatabase).mockResolvedValue({
      databaseId: 'db-leads-1',
      columns: [{ name: 'Name', type: 'title' }, { name: 'Email', type: 'email' }],
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

  it('should throw when page content is only whitespace', async () => {
    mockAct.mockResolvedValueOnce({ data: { title: 'Empty', content: '   \n  \t  ' } })

    const { runBuildWorkflow } = await import('../workflows/build')
    await expect(runBuildWorkflow(input)).rejects.toThrow('Page has no text content')
  })

  it('should skip createNotionDatabase when needsDatabases is false', async () => {
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithoutDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    const result = await runBuildWorkflow(input)

    expect(mockFn(notionApi.createNotionDatabase)).not.toHaveBeenCalled()
    expect(result.appUrl).toBe('https://app.example.com')
  })

  it('should call createNotionDatabase per planned db when needsDatabases is true', async () => {
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    await runBuildWorkflow(input)

    expect(mockFn(notionApi.createNotionDatabase)).toHaveBeenCalledTimes(1)
    expect(mockFn(notionApi.createNotionDatabase)).toHaveBeenCalledWith(
      'page-1',
      'Leads',
      [{ name: 'Name', type: 'title', options: undefined }, { name: 'Email', type: 'email', options: undefined }],
    )
  })

  it('should embed read/create URLs in task_description when needsDatabases is true', async () => {
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    await runBuildWorkflow(input)

    const invokeArg = mockFn(spektrumClient.spektrumGenerateTool.invoke).mock.calls[0][0]
    expect(invokeArg.task_description).toContain('http://test/api/data?databaseId=db-leads-1')
    expect(invokeArg.task_description).toContain('http://test/api/data/create')
  })

  it('should truncate content with [...truncated] when exceeding budget', async () => {
    // Build task: data ~800 chars, style ~350 chars, tech ~100 chars = ~1250 reserved
    // maxContentLen ≈ 3000 - 1250 = 1750
    const longContent = 'X'.repeat(3000)
    mockAct
      .mockResolvedValueOnce({ data: { title: 'Big App', content: longContent } })
      .mockResolvedValueOnce(planWithoutDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    await runBuildWorkflow(input)

    const invokeArg = mockFn(spektrumClient.spektrumGenerateTool.invoke).mock.calls[0][0]
    expect(invokeArg.task_description).toContain('[...truncated]')
    // Total task_description should be ≤ 3000 chars
    expect(invokeArg.task_description.length).toBeLessThanOrEqual(3000)
  })

  it('should call spektrumGenerateTool.invoke with owner, task_title, task_description', async () => {
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    await runBuildWorkflow(input)

    expect(mockFn(spektrumClient.spektrumGenerateTool.invoke)).toHaveBeenCalledWith({
      owner: 'user-1',
      task_title: 'My App',
      task_description: expect.any(String),
    })
  })

  it('should embed the dashboard and notifyUser', async () => {
    const patchInvoke = vi.fn()
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: patchInvoke })
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithoutDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    await runBuildWorkflow(input)

    expect(mockFn(notionMcp.getNotionMcpTool)).toHaveBeenCalledWith('API-patch-block-children')
    expect(patchInvoke).toHaveBeenCalledWith(
      expect.objectContaining({
        block_id: 'page-1',
        children: expect.arrayContaining([
          expect.objectContaining({ type: 'embed' }),
        ]),
      }),
    )
    expect(mockFn(notionApi.notifyUser)).toHaveBeenCalledWith(
      'page-1',
      'user-1',
      expect.stringContaining('is ready'),
    )
  })

  it('should return { appUrl, projectId, taskId }', async () => {
    mockAct
      .mockResolvedValueOnce(pageContentResult)
      .mockResolvedValueOnce(planWithoutDatabasesResult)

    const { runBuildWorkflow } = await import('../workflows/build')
    const result = await runBuildWorkflow(input)

    expect(result).toEqual({
      appUrl: 'https://app.example.com',
      projectId: 'proj-1',
      taskId: 'task-1',
    })
  })
})
