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
  retrieveDatabaseSchema: vi.fn(),
  queryDatabase: vi.fn(),
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

vi.mock('../../src/lib/dashboard-registry', () => ({
  registerDashboard: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Imports under test
// ---------------------------------------------------------------------------
import { MozaikAgent } from '@mozaik-ai/core'
import * as mcp from '../../src/notion/mcp'
import * as api from '../../src/notion/api'
import { spektrumGenerateTool } from '../../src/spektrum/client'
import * as registry from '../../src/lib/dashboard-registry'
import { runGenerateWorkflow } from '../../src/workflows/generate'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const defaultInput = {
  pageId: 'page-123',
  userId: 'user-456',
  proxyBaseUrl: 'http://localhost:3000',
  refineWebhookUrl: 'http://localhost:3000/api/refine',
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

const scannerResult = {
  data: {
    databases: [{ id: 'db1', name: 'Customers' }],
    pageTitle: 'Test Dashboard Page',
  },
}

const analystResult = {
  data: {
    dashboardName: 'Customer Dashboard',
    databases: [
      { id: 'db1', name: 'Customers', columnSummary: 'Name, Email, Status', keyInsights: 'High value customers' },
    ],
    relationships: 'Single database with customer data',
    recommendedVisualizations: [
      { title: 'Revenue KPI', type: 'kpi', databases: ['db1'], description: 'Total revenue' },
    ],
  },
}

const architectResult = {
  data: {
    taskDescription: 'Build a dashboard showing customer metrics with KPIs and charts.',
  },
}

const spektrumResult = {
  appUrl: 'https://app.spektrum.dev/customer-dashboard',
  projectId: 'proj-cust-123',
  taskId: 'task-cust-456',
}

const dbSchema = {
  database_id: 'db1',
  name: 'Customers',
  columns: {
    Name: { type: 'title', options: undefined },
    Email: { type: 'email', options: undefined },
    Status: { type: 'select', options: ['Active', 'Inactive'] },
  },
}

const dbData = {
  rows: [{ id: 'row-1' }, { id: 'row-2' }],
  total: 2,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runGenerateWorkflow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: scans, analyzes, builds, embeds, registers and returns GenerateOutput', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function () { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce(analystResult)
      .mockResolvedValueOnce(architectResult)

    const output = await runGenerateWorkflow(defaultInput)

    // ── Agent 1 (scanner) receives pageId in its prompt ───────────
    expect(actMock.mock.calls[0][0]).toContain('page-123')

    // ── Schemas and data fetched for each database ─────────────────
    expect(api.retrieveDatabaseSchema).toHaveBeenCalledWith('db1')
    expect(api.queryDatabase).toHaveBeenCalledWith('db1', 30)

    // ── Analyst receives dbData in its prompt ─────────────────────
    expect(actMock.mock.calls[1][0]).toContain('db1')

    // ── Architect receives proxyBaseUrl-based data URL in its prompt ──
    const architectPrompt = actMock.mock.calls[2][0]
    expect(architectPrompt).toContain('http://localhost:3000/api/data?databaseId=db1')

    // ── Spektrum generate invoked ─────────────────────────────────
    expect(spektrumGenerateTool.invoke).toHaveBeenCalledWith({
      owner: defaultInput.userId,
      task_title: analystResult.data.dashboardName,
      task_description: architectResult.data.taskDescription,
    })

    // ── MCP patch tool invoked ────────────────────────────────────
    expect(mcp.getNotionMcpTool).toHaveBeenCalledWith('API-patch-block-children')
    expect(mockPatchTool.invoke).toHaveBeenCalledWith({
      block_id: defaultInput.pageId,
      children: expect.arrayContaining([
        { type: 'divider', divider: {} },
        expect.objectContaining({ type: 'embed' }),
      ]),
    })

    // ── Dashboard registered ──────────────────────────────────────
    expect(registry.registerDashboard).toHaveBeenCalledWith(
      defaultInput.pageId,
      spektrumResult.projectId,
      spektrumResult.taskId,
      ['db1'],
    )

    // ── Notify user ───────────────────────────────────────────────
    expect(api.notifyUser).toHaveBeenCalledWith(
      defaultInput.pageId,
      defaultInput.userId,
      expect.stringContaining('Customer Dashboard'),
    )

    // ── Return value ──────────────────────────────────────────────
    expect(output).toEqual({
      appUrl: spektrumResult.appUrl,
      projectId: spektrumResult.projectId,
      taskId: spektrumResult.taskId,
      dashboardName: analystResult.data.dashboardName,
    })
  })

  it('throws "No databases found on page" when scanner returns empty databases', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce({ data: { databases: [], pageTitle: 'Empty' } })

    await expect(runGenerateWorkflow(defaultInput)).rejects.toThrow('No databases found on page.')
  })

  it('throws when scanner returns undefined databases (filter empties)', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce({ data: { databases: [{ id: '', name: 'No ID' }], pageTitle: 'Bad' } })

    await expect(runGenerateWorkflow(defaultInput)).rejects.toThrow('No databases found on page.')
  })

  it('truncates taskDescription to 3000 chars when it exceeds limit', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const longDescription = 'x'.repeat(3500)
    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce(analystResult)
      .mockResolvedValueOnce({ data: { taskDescription: longDescription } })

    await runGenerateWorkflow(defaultInput)

    const passedTaskDesc = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(passedTaskDesc.length).toBe(3000)
    expect(passedTaskDesc).toBe(longDescription.slice(0, 3000))
  })

  it('taskDescription at exactly 3000 chars is not truncated', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const exactDescription = 'y'.repeat(3000)
    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce(analystResult)
      .mockResolvedValueOnce({ data: { taskDescription: exactDescription } })

    await runGenerateWorkflow(defaultInput)

    const passedTaskDesc = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(passedTaskDesc.length).toBe(3000)
    expect(passedTaskDesc).toBe(exactDescription)
  })

  it('does not throw when recommendedVisualizations is missing (length defaults to 0)', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce({
        data: {
          dashboardName: 'No Viz Dashboard',
          databases: [{ id: 'db1', name: 'Customers', columnSummary: 'X', keyInsights: 'Y' }],
          relationships: 'None',
          // no recommendedVisualizations field
        },
      })
      .mockResolvedValueOnce({ data: { taskDescription: 'Short spec' } })

    await expect(runGenerateWorkflow(defaultInput)).resolves.toMatchObject({
      dashboardName: 'No Viz Dashboard',
    })
  })

  it('constructs data URLs with proxyBaseUrl and databaseId params', async () => {
    const customBaseUrl = 'https://my-vizion.example.com'
    const input = { ...defaultInput, proxyBaseUrl: customBaseUrl }

    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce(analystResult)
      .mockResolvedValueOnce(architectResult)

    await runGenerateWorkflow(input)

    const architectPrompt = actMock.mock.calls[2][0]
    expect(architectPrompt).toContain(`${customBaseUrl}/api/data?databaseId=db1`)
  })

  it('passes multiple database IDs as query params when multiple databases are found', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(dbSchema)
    vi.mocked(api.queryDatabase).mockResolvedValue(dbData)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          databases: [
            { id: 'db1', name: 'Customers' },
            { id: 'db2', name: 'Orders' },
          ],
          pageTitle: 'Multi DB Page',
        },
      })
      .mockResolvedValueOnce({
        data: {
          dashboardName: 'Multi Dashboard',
          databases: [
            { id: 'db1', name: 'Customers', columnSummary: 'X', keyInsights: 'Y' },
            { id: 'db2', name: 'Orders', columnSummary: 'Y', keyInsights: 'Z' },
          ],
          relationships: 'Customers have orders',
          recommendedVisualizations: [{ title: 'KPI', type: 'kpi', databases: ['db1', 'db2'], description: 'Test' }],
        },
      })
      .mockResolvedValueOnce({ data: { taskDescription: 'Multi-db dashboard' } })

    await runGenerateWorkflow(defaultInput)

    expect(api.retrieveDatabaseSchema).toHaveBeenCalledWith('db1')
    expect(api.retrieveDatabaseSchema).toHaveBeenCalledWith('db2')
    expect(api.queryDatabase).toHaveBeenCalledWith('db2', 30)

    const architectPrompt = actMock.mock.calls[2][0]
    expect(architectPrompt).toContain('databaseId=db1&databaseId=db2')
  })
})
