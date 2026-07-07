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
  retrieveDatabaseSchema: vi.fn(),
  notifyUser: vi.fn(),
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

const scanSingleDbResult = {
  data: {
    databases: [{ id: 'db-1', name: 'Leads' }],
    pageTitle: 'Form Page',
  },
}

const scanMultipleDbResult = {
  data: {
    databases: [
      { id: 'db-1', name: 'Leads' },
      { id: 'db-2', name: 'Orders' },
    ],
    pageTitle: 'Form Page',
  },
}

const designResult = {
  data: { taskDescription: 'Build a lead capture form with Name and Email fields.' },
}

const input = {
  pageId: 'page-1',
  userId: 'user-1',
  proxyBaseUrl: 'http://test',
}

describe('workflows/form', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockFn(notionMcp.getNotionMcpTools).mockResolvedValue([
      { name: 'API-get-block-children', invoke: vi.fn() },
    ])
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: vi.fn() })
    mockFn(notionApi.retrieveDatabaseSchema).mockResolvedValue({
      database_id: 'db-1',
      name: 'Leads',
      columns: {
        Name: { type: 'title' },
        Email: { type: 'email' },
        Status: { type: 'select', options: ['New', 'Contacted'] },
      },
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

  it('should throw when no databases are found on the page', async () => {
    mockAct.mockResolvedValueOnce({ data: { databases: [], pageTitle: 'Empty' } })

    const { runFormWorkflow } = await import('../workflows/form')
    await expect(runFormWorkflow(input)).rejects.toThrow('No databases found on page.')
  })

  it('should use the first database as the target', async () => {
    mockAct
      .mockResolvedValueOnce(scanMultipleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    const result = await runFormWorkflow(input)

    // Form name should come from the first database
    expect(result.formName).toBe('Leads')
  })

  it('should call retrieveDatabaseSchema for the target database', async () => {
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    await runFormWorkflow(input)

    expect(mockFn(notionApi.retrieveDatabaseSchema)).toHaveBeenCalledWith('db-1')
  })

  it('should filter editable fields excluding read-only types and map title/rich_text to text with options annotation', async () => {
    mockFn(notionApi.retrieveDatabaseSchema).mockResolvedValue({
      database_id: 'db-1',
      name: 'Full Schema',
      columns: {
        Name: { type: 'title' },
        Bio: { type: 'rich_text' },
        Age: { type: 'number' },
        Status: { type: 'select', options: ['New', 'Contacted', 'Done'] },
        Tags: { type: 'multi_select', options: ['A', 'B'] },
        Email: { type: 'email' },
        Website: { type: 'url' },
        Phone: { type: 'phone_number' },
        Active: { type: 'checkbox' },
        Birthday: { type: 'date' },
        Formula: { type: 'formula' },      // should be excluded
        Rollup: { type: 'rollup' },         // should be excluded
        Relation: { type: 'relation' },     // should be excluded
        People: { type: 'people' },         // should be excluded
      },
    })
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    await runFormWorkflow(input)

    // Editable fields are injected into the architect's prompt (2nd act call)
    const architectPrompt = mockAct.mock.calls[1][0]
    expect(architectPrompt).toContain('- Name: text')    // title → text
    expect(architectPrompt).toContain('- Bio: text')      // rich_text → text
    expect(architectPrompt).toContain('- Age: number')
    expect(architectPrompt).toContain('- Status: select (options: New, Contacted, Done)') // select with options
    expect(architectPrompt).toContain('- Tags: multi_select (options: A, B)')
    expect(architectPrompt).toContain('- Email: email')
    expect(architectPrompt).toContain('- Website: url')
    expect(architectPrompt).toContain('- Phone: phone_number')
    expect(architectPrompt).toContain('- Active: checkbox')
    expect(architectPrompt).toContain('- Birthday: date')
    // Should NOT contain read-only types
    expect(architectPrompt).not.toContain('Formula')
    expect(architectPrompt).not.toContain('Rollup')
    expect(architectPrompt).not.toContain('Relation')
    expect(architectPrompt).not.toContain('People')
  })

  it('should truncate taskDescription to 3000 when longer', async () => {
    const longDesc = 'B'.repeat(4000)
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce({ data: { taskDescription: longDesc } })

    const { runFormWorkflow } = await import('../workflows/form')
    await runFormWorkflow(input)

    const invokeArg = mockFn(spektrumClient.spektrumGenerateTool.invoke).mock.calls[0][0]
    expect(invokeArg.task_description.length).toBeLessThanOrEqual(3000)
  })

  it('should invoke spektrumGenerateTool with task_title containing "<name> Form"', async () => {
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    await runFormWorkflow(input)

    expect(mockFn(spektrumClient.spektrumGenerateTool.invoke)).toHaveBeenCalledWith({
      owner: 'user-1',
      task_title: 'Leads Form',
      task_description: expect.any(String),
    })
  })

  it('should embed the form and notifyUser', async () => {
    const patchInvoke = vi.fn()
    mockFn(notionMcp.getNotionMcpTool).mockReturnValue({ name: 'API-patch-block-children', invoke: patchInvoke })
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    await runFormWorkflow(input)

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

  it('should return { appUrl, projectId, taskId, formName }', async () => {
    mockAct
      .mockResolvedValueOnce(scanSingleDbResult)
      .mockResolvedValueOnce(designResult)

    const { runFormWorkflow } = await import('../workflows/form')
    const result = await runFormWorkflow(input)

    expect(result).toMatchObject({
      appUrl: 'https://app.example.com',
      projectId: 'proj-1',
      taskId: 'task-1',
      formName: 'Leads',
    })
  })
})
