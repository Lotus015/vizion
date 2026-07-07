// ---------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// ---------------------------------------------------------------------------
const { mockClient, MockClient, MockTransport } = vi.hoisted(() => {
  const client = {
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    listTools: vi.fn(),
    callTool: vi.fn(),
  }
  return {
    mockClient: client,
    MockClient: vi.fn(function () { return client }),
    MockTransport: vi.fn(function () { return {} }),
  }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: MockClient,
}))

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
  StdioClientTransport: MockTransport,
}))

// ---------------------------------------------------------------------------
// Imports under test (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import {
  getNotionMcpTools,
  getNotionMcpTool,
  closeNotionMcp,
} from '../../src/notion/mcp'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeAll(() => {
  process.env.NOTION_API_KEY = 'test-secret-key'
})

afterEach(async () => {
  await closeNotionMcp()
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// getNotionMcpTools — first call connects + lists tools
// ---------------------------------------------------------------------------
describe('getNotionMcpTools()', () => {
  it('first call connects transport and lists tools, returning Mozaik-Tool wrappers', async () => {
    mockClient.listTools.mockResolvedValueOnce({
      tools: [
        { name: 'API-query', description: 'Query a database', inputSchema: { type: 'object' } },
        { name: 'API-retrieve', description: '', inputSchema: null },
      ],
    })

    const tools = await getNotionMcpTools()

    // Client was constructed once
    expect(MockClient).toHaveBeenCalledTimes(1)
    expect(MockClient).toHaveBeenCalledWith(
      { name: 'vizion', version: '0.1.0' },
      { capabilities: {} },
    )

    // Transport was created
    expect(MockTransport).toHaveBeenCalledTimes(1)
    expect(MockTransport).toHaveBeenCalledWith({
      command: 'npx',
      args: ['-y', '@notionhq/notion-mcp-server'],
      env: expect.objectContaining({
        NOTION_TOKEN: 'test-secret-key',
      }),
    })

    // Connect was called once
    expect(mockClient.connect).toHaveBeenCalledTimes(1)

    // listTools was called once
    expect(mockClient.listTools).toHaveBeenCalledTimes(1)

    // Returned wrappers have the expected shape
    expect(tools).toHaveLength(2)
    expect(tools[0].name).toBe('API-query')
    expect(tools[0].description).toBe('Query a database')
    expect(tools[0].schema).toEqual({ type: 'object' })
    expect(typeof tools[0].invoke).toBe('function')

    expect(tools[1].name).toBe('API-retrieve')
    expect(tools[1].description).toBe('')  // empty description preserved
    expect(tools[1].schema).toBeNull()
  })

  it('second call returns cached tools without re-connecting', async () => {
    mockClient.listTools.mockResolvedValueOnce({
      tools: [{ name: 'API-query', description: 'Q', inputSchema: {} }],
    })

    const first = await getNotionMcpTools()
    const second = await getNotionMcpTools()

    // Same array reference (cached)
    expect(second).toBe(first)

    // Client constructed only once
    expect(MockClient).toHaveBeenCalledTimes(1)

    // connect and listTools called only once
    expect(mockClient.connect).toHaveBeenCalledTimes(1)
    expect(mockClient.listTools).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// Tool wrapper — invoke behavior
// ---------------------------------------------------------------------------
describe('tool wrapper .invoke()', () => {
  beforeEach(() => {
    mockClient.listTools.mockResolvedValue({
      tools: [{ name: 'API-test', description: 'Test tool', inputSchema: {} }],
    })
  })

  it('parses JSON text content and returns the parsed object', async () => {
    mockClient.callTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"result":"ok","count":5}' }],
    })

    const [tool] = await getNotionMcpTools()
    const result = await tool.invoke({ arg1: 'val1' })

    expect(mockClient.callTool).toHaveBeenCalledWith({
      name: 'API-test',
      arguments: { arg1: 'val1' },
    })
    expect(result).toEqual({ result: 'ok', count: 5 })
  })

  it('non-JSON text returns { text } object', async () => {
    mockClient.callTool.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'hello world' }],
    })

    const [tool] = await getNotionMcpTools()
    const result = await tool.invoke({})

    expect(result).toEqual({ text: 'hello world' })
  })

  it('isError: true does not throw, still returns parsed JSON', async () => {
    mockClient.callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: '{"error":"permission denied"}' }],
    })

    const [tool] = await getNotionMcpTools()
    const result = await tool.invoke({})

    // Does NOT throw — returns the parsed error payload
    expect(result).toEqual({ error: 'permission denied' })
  })

  it('isError: true with non-JSON text returns { text }', async () => {
    mockClient.callTool.mockResolvedValueOnce({
      isError: true,
      content: [{ type: 'text', text: 'something went wrong' }],
    })

    const [tool] = await getNotionMcpTools()
    const result = await tool.invoke({})

    expect(result).toEqual({ text: 'something went wrong' })
  })

  it('joins multiple text content blocks', async () => {
    mockClient.callTool.mockResolvedValueOnce({
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '1}' },
      ],
    })

    const [tool] = await getNotionMcpTools()
    const result = await tool.invoke({})

    expect(result).toEqual({ a: 1 })
  })
})

// ---------------------------------------------------------------------------
// getNotionMcpTool — lookup by name
// ---------------------------------------------------------------------------
describe('getNotionMcpTool()', () => {
  beforeEach(() => {
    mockClient.listTools.mockResolvedValue({
      tools: [
        { name: 'API-query', description: 'Q', inputSchema: {} },
        { name: 'API-create', description: 'C', inputSchema: {} },
      ],
    })
  })

  it('returns the tool when found', async () => {
    const tool = await getNotionMcpTool('API-create')
    expect(tool.name).toBe('API-create')
    expect(tool.description).toBe('C')
    expect(typeof tool.invoke).toBe('function')
  })

  it('throws for an unknown tool name', async () => {
    await expect(getNotionMcpTool('nonexistent')).rejects.toThrow(
      'Notion MCP tool "nonexistent" not found',
    )
  })
})

// ---------------------------------------------------------------------------
// closeNotionMcp — singleton reset
// ---------------------------------------------------------------------------
describe('closeNotionMcp()', () => {
  it('clears the singleton so the next call reconnects', async () => {
    mockClient.listTools.mockResolvedValue({
      tools: [{ name: 'API-test', description: 'T', inputSchema: {} }],
    })

    const first = await getNotionMcpTools()
    expect(first).toHaveLength(1)
    expect(MockClient).toHaveBeenCalledTimes(1)

    // Reset the singleton
    await closeNotionMcp()
    expect(mockClient.close).toHaveBeenCalledTimes(1)

    // Give listTools a different response to distinguish
    mockClient.listTools.mockResolvedValue({
      tools: [{ name: 'API-other', description: 'O', inputSchema: {} }],
    })

    const second = await getNotionMcpTools()
    expect(second).toHaveLength(1)
    expect(second[0].name).toBe('API-other') // new tools fetched

    // A new Client was constructed (reconnect)
    expect(MockClient).toHaveBeenCalledTimes(2)
    expect(mockClient.connect).toHaveBeenCalledTimes(2)
  })

  it('is safe to call when no client exists', async () => {
    // closeNotionMcp is called in afterEach, but explicitly test the noop case
    await expect(closeNotionMcp()).resolves.toBeUndefined()
  })
})
