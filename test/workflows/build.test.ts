// ---------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// ---------------------------------------------------------------------------
vi.mock('@mozaik-ai/core', () => ({
  MozaikAgent: vi.fn(),
  Tool: {},
}))

vi.mock('../../src/notion/mcp', () => ({
  getNotionMcpTools: vi.fn(),
  getNotionMcpTool: vi.fn(),
}))

vi.mock('../../src/notion/api', () => ({
  notifyUser: vi.fn(),
  createNotionDatabase: vi.fn(),
}))

vi.mock('../../src/spektrum/client', () => ({
  spektrumGenerateTool: { invoke: vi.fn() },
}))

vi.mock('../../src/mozaik/helpers', () => ({
  parseAgentResult: vi.fn((x: unknown) => {
    const obj = x as any
    return obj?.data ?? x
  }),
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { MozaikAgent } from '@mozaik-ai/core'
import * as mcp from '../../src/notion/mcp'
import * as api from '../../src/notion/api'
import { spektrumGenerateTool } from '../../src/spektrum/client'
import { runBuildWorkflow } from '../../src/workflows/build'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const defaultInput = {
  pageId: 'page-build-1',
  userId: 'user-build-1',
  proxyBaseUrl: 'http://localhost:3000',
}

const mockMcpTools = [
  {
    name: 'API-get-block-children',
    description: 'Get block children',
    schema: {},
    invoke: vi.fn(),
  },
]

const mockPatchTool = {
  name: 'API-patch-block-children',
  description: 'Patch block children',
  schema: {},
  invoke: vi.fn().mockResolvedValue({}),
}

const pageContentResultWithData = {
  data: {
    title: 'Lead Capture App',
    content: 'Build a landing page that captures email leads from visitors. Include a form with name, email, and phone. Store submissions in a database.',
  },
}

const pageContentResultNoData = {
  data: {
    title: 'Empty Page',
    content: '',
  },
}

const pageContentResultWhitespace = {
  data: {
    title: 'Whitespace Only',
    content: '   \n  \t  ',
  },
}

const planWithDatabases = {
  data: {
    needsDatabases: true,
    databases: [
      {
        name: 'Leads',
        columns: [
          { name: 'Name', type: 'title', options: null },
          { name: 'Email', type: 'email', options: null },
          { name: 'Phone', type: 'phone_number', options: null },
        ],
      },
    ],
  },
}

const planWithoutDatabases = {
  data: {
    needsDatabases: false,
    databases: [],
  },
}

const createdDbResult = {
  databaseId: 'db-leads-1',
  columns: [
    { name: 'Name', type: 'title' },
    { name: 'Email', type: 'email' },
    { name: 'Phone', type: 'phone_number' },
  ],
}

const spektrumResult = {
  appUrl: 'https://app.spektrum.dev/lead-capture',
  projectId: 'proj-build-1',
  taskId: 'task-build-1',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runBuildWorkflow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('happy path with needsDatabases: true — creates databases and invokes Spektrum', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.createNotionDatabase).mockResolvedValue(createdDbResult)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(pageContentResultWithData)
      .mockResolvedValueOnce(planWithDatabases)

    const output = await runBuildWorkflow(defaultInput)

    // ── Reader agent gets pageId in prompt ────────────────────────
    expect(actMock.mock.calls[0][0]).toContain('page-build-1')

    // ── Planner agent gets title and content in prompt ────────────
    expect(actMock.mock.calls[1][0]).toContain('Lead Capture App')
    expect(actMock.mock.calls[1][0]).toContain('email leads')

    // ── createNotionDatabase called per planned db ────────────────
    expect(api.createNotionDatabase).toHaveBeenCalledTimes(1)
    expect(api.createNotionDatabase).toHaveBeenCalledWith(
      defaultInput.pageId,
      'Leads',
      [
        { name: 'Name', type: 'title', options: undefined },
        { name: 'Email', type: 'email', options: undefined },
        { name: 'Phone', type: 'phone_number', options: undefined },
      ],
    )

    // ── Spektrum invoked with taskDescription containing read/write URLs and style block ──
    expect(spektrumGenerateTool.invoke).toHaveBeenCalledTimes(1)
    const taskDescription = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(taskDescription).toContain('/api/data?databaseId=db-leads-1')
    expect(taskDescription).toContain('/api/data/create')
    expect(taskDescription).toContain('MANDATORY STYLE')
    expect(taskDescription).toContain('#ffffff')

    // ── Embed blocks appended ─────────────────────────────────────
    expect(mcp.getNotionMcpTool).toHaveBeenCalledWith('API-patch-block-children')
    expect(mockPatchTool.invoke).toHaveBeenCalledWith({
      block_id: defaultInput.pageId,
      children: expect.arrayContaining([
        { type: 'divider', divider: {} },
        expect.objectContaining({ type: 'embed' }),
      ]),
    })

    // ── User notified ─────────────────────────────────────────────
    expect(api.notifyUser).toHaveBeenCalledWith(
      defaultInput.pageId,
      defaultInput.userId,
      expect.stringContaining('Lead Capture App'),
    )

    // ── Return value ──────────────────────────────────────────────
    expect(output).toEqual({
      appUrl: spektrumResult.appUrl,
      projectId: spektrumResult.projectId,
      taskId: spektrumResult.taskId,
    })
  })

  it('happy path with needsDatabases: false — no db creation, no data integration notes', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          title: 'Static Landing Page',
          content: 'A simple static landing page with hero, features, and footer.',
        },
      })
      .mockResolvedValueOnce(planWithoutDatabases)

    const output = await runBuildWorkflow(defaultInput)

    // No databases created
    expect(api.createNotionDatabase).not.toHaveBeenCalled()

    // taskDescription should NOT contain Data integration section
    const taskDescription = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(taskDescription).not.toContain('Data integration')
    expect(taskDescription).not.toContain('/api/data')

    // Still has style
    expect(taskDescription).toContain('MANDATORY STYLE')

    expect(output).toEqual({
      appUrl: spektrumResult.appUrl,
      projectId: spektrumResult.projectId,
      taskId: spektrumResult.taskId,
    })
  })

  it('throws when page content is empty', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(pageContentResultNoData)

    await expect(runBuildWorkflow(defaultInput)).rejects.toThrow(
      'Page has no text content. Write a description of what you want to build.',
    )
  })

  it('throws when page content is only whitespace', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce(pageContentResultWhitespace)

    await expect(runBuildWorkflow(defaultInput)).rejects.toThrow(
      'Page has no text content. Write a description of what you want to build.',
    )
  })

  it('truncates page content when it exceeds maxContentLen and caps taskDescription at 3000 chars', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.createNotionDatabase).mockResolvedValue(createdDbResult)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)

    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    // Use massive content so it definitely exceeds 3000 even after content truncation
    const massiveContent = 'x'.repeat(10_000)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          title: 'Long Page',
          content: massiveContent,
        },
      })
      .mockResolvedValueOnce(planWithDatabases)

    await runBuildWorkflow(defaultInput)

    const taskDescription = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    // Content should be truncated (has [...truncated] marker)
    expect(taskDescription).toContain('[...truncated]')
    // taskDescription is capped at 3000 via slice(0,3000)
    expect(taskDescription.length).toBeLessThanOrEqual(3000)
  })

  it('does not truncate content when it fits within maxContentLen', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.createNotionDatabase).mockResolvedValue(createdDbResult)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const shortContent = 'Build a simple contact form with name, email, and message fields.'

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          title: 'Contact Form',
          content: shortContent,
        },
      })
      .mockResolvedValueOnce(planWithDatabases)

    await runBuildWorkflow(defaultInput)

    const taskDescription = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(taskDescription).not.toContain('[truncated]')
    expect(taskDescription).toContain(shortContent)
  })

  it('passes taskDescription.slice(0,3000) to Spektrum when taskDescription exceeds 3000', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.createNotionDatabase).mockResolvedValue(createdDbResult)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)

    const hugeContent = 'Build. '.repeat(2000) // ~14000 chars — way over budget
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          title: 'Huge Page',
          content: hugeContent,
        },
      })
      .mockResolvedValueOnce(planWithDatabases)

    await runBuildWorkflow(defaultInput)

    const invokeArg = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0]
    // Content is truncated to fit within the budget; final description capped at 3000 via slice
    expect(invokeArg.task_description.length).toBeLessThanOrEqual(3000)
    expect(invokeArg.task_description).toContain('[...truncated]')
  })
})
