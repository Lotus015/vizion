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
  retrieveDatabaseSchema: vi.fn(),
  notifyUser: vi.fn(),
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
import { runFormWorkflow } from '../../src/workflows/form'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const defaultInput = {
  pageId: 'page-form-1',
  userId: 'user-form-1',
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

const scannerResult = {
  data: {
    databases: [
      { id: 'db-form-1', name: 'Submissions' },
      { id: 'db-form-2', name: 'Users' },
    ],
    pageTitle: 'Form Page',
  },
}

const targetDbSchema = {
  database_id: 'db-form-1',
  name: 'Submissions',
  columns: {
    Name: { type: 'title', options: undefined },
    Email: { type: 'email', options: undefined },
    Message: { type: 'rich_text', options: undefined },
    Rating: { type: 'select', options: ['Good', 'Average', 'Bad'] },
    Score: { type: 'number', options: undefined },
    Agreed: { type: 'checkbox', options: undefined },
    SubmittedAt: { type: 'date', options: undefined },
    // Non-editable types that should be filtered out
    Formula: { type: 'formula', options: undefined },
    Rollup: { type: 'rollup', options: undefined },
    CreatedBy: { type: 'created_by', options: undefined },
  },
}

const architectResult = {
  data: {
    taskDescription: 'Build a lead capture form with Name, Email, Message, Rating, Score, Agreed, and SubmittedAt fields.',
  },
}

const spektrumResult = {
  appUrl: 'https://app.spektrum.dev/submissions-form',
  projectId: 'proj-form-1',
  taskId: 'task-form-1',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('runFormWorkflow', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('happy path: first db as target, schema retrieved, editable fields filtered, Spektrum invoked with title "<name> Form", embed blocks, notifyUser, returns FormOutput', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(targetDbSchema)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce(architectResult)

    const output = await runFormWorkflow(defaultInput)

    // ── First database used as target ─────────────────────────────
    expect(api.retrieveDatabaseSchema).toHaveBeenCalledWith('db-form-1')

    // ── Editable fields only (non-editable types filtered out) ────
    const architectPrompt = actMock.mock.calls[1][0]
    expect(architectPrompt).toContain('- Name: text')        // title → text
    expect(architectPrompt).toContain('- Email: email')
    expect(architectPrompt).toContain('- Message: text')     // rich_text → text
    expect(architectPrompt).toContain('- Rating: select (options: Good, Average, Bad)')
    expect(architectPrompt).toContain('- Score: number')
    expect(architectPrompt).toContain('- Agreed: checkbox')
    expect(architectPrompt).toContain('- SubmittedAt: date')
    // Non-editable types filtered out
    expect(architectPrompt).not.toContain('Formula')
    expect(architectPrompt).not.toContain('Rollup')
    expect(architectPrompt).not.toContain('CreatedBy')

    // ── Spektrum invoked with title "<name> Form" ────────────────
    expect(spektrumGenerateTool.invoke).toHaveBeenCalledWith({
      owner: defaultInput.userId,
      task_title: 'Submissions Form',
      task_description: architectResult.data.taskDescription,
    })

    // ── Embed blocks appended ─────────────────────────────────────
    expect(mcp.getNotionMcpTool).toHaveBeenCalledWith('API-patch-block-children')
    expect(mockPatchTool.invoke).toHaveBeenCalledWith({
      block_id: defaultInput.pageId,
      children: expect.arrayContaining([
        { type: 'divider', divider: {} },
        expect.objectContaining({
          type: 'heading_2',
          heading_2: expect.objectContaining({
            rich_text: expect.arrayContaining([
              expect.objectContaining({ text: { content: '📝 Submissions Form' } }),
            ]),
          }),
        }),
        { type: 'embed', embed: { url: spektrumResult.appUrl } },
      ]),
    })

    // ── notifyUser called ─────────────────────────────────────────
    expect(api.notifyUser).toHaveBeenCalledWith(
      defaultInput.pageId,
      defaultInput.userId,
      expect.stringContaining('"Submissions"'),
    )

    // ── Return value ──────────────────────────────────────────────
    expect(output).toEqual({
      appUrl: spektrumResult.appUrl,
      projectId: spektrumResult.projectId,
      taskId: spektrumResult.taskId,
      formName: 'Submissions',
    })
  })

  it('throws "No databases found on page" when scanner returns empty databases', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce({ data: { databases: [], pageTitle: 'Empty' } })

    await expect(runFormWorkflow(defaultInput)).rejects.toThrow('No databases found on page.')
  })

  it('throws when filtered databases (empty ids) result in no databases', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock.mockResolvedValueOnce({
      data: {
        databases: [{ id: '', name: 'Bad DB' }],
        pageTitle: 'Bad',
      },
    })

    await expect(runFormWorkflow(defaultInput)).rejects.toThrow('No databases found on page.')
  })

  it('truncates taskDescription to 3000 chars when it exceeds limit', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(targetDbSchema)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const longDescription = 'Build a form. '.repeat(500) // ~7500 chars
    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce(scannerResult)
      .mockResolvedValueOnce({ data: { taskDescription: longDescription } })

    await runFormWorkflow(defaultInput)

    const passedTaskDesc = vi.mocked(spektrumGenerateTool.invoke).mock.calls[0][0].task_description
    expect(passedTaskDesc.length).toBe(3000)
    expect(passedTaskDesc).toBe(longDescription.slice(0, 3000))
  })

  it('uses the first database when multiple are returned', async () => {
    vi.mocked(mcp.getNotionMcpTools).mockResolvedValue(mockMcpTools)
    vi.mocked(mcp.getNotionMcpTool).mockResolvedValue(mockPatchTool)
    vi.mocked(api.retrieveDatabaseSchema).mockResolvedValue(targetDbSchema)
    vi.mocked(api.notifyUser).mockResolvedValue(undefined)
    vi.mocked(spektrumGenerateTool.invoke).mockResolvedValue(spektrumResult)

    const actMock = vi.fn()
    vi.mocked(MozaikAgent).mockImplementation(function() { return { act: actMock } })
    actMock
      .mockResolvedValueOnce({
        data: {
          databases: [
            { id: 'first-db', name: 'First Database' },
            { id: 'second-db', name: 'Second Database' },
          ],
          pageTitle: 'Multi DB',
        },
      })
      .mockResolvedValueOnce(architectResult)

    await runFormWorkflow(defaultInput)

    // Should use the first database
    expect(api.retrieveDatabaseSchema).toHaveBeenCalledWith('first-db')
    expect(spektrumGenerateTool.invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        task_title: 'First Database Form',
      }),
    )
  })
})
