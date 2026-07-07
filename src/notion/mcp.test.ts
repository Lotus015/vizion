import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock @modelcontextprotocol/sdk ─────────────────────────────────────
// Use vi.hoisted so the mock factory can reference the stub
const { mcpClientMock } = vi.hoisted(() => {
  const mockClient = {
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
    close: vi.fn(),
  }
  return { mcpClientMock: mockClient }
})

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => {
  return {
    Client: class {
      constructor(_info: any, _opts: any) {
        return mcpClientMock
      }
    },
  }
})

vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => {
  return {
    StdioClientTransport: class {
      constructor(_opts: any) {
        // no-op
      }
    },
  }
})

// Helper to get a fresh module instance
async function freshMcp() {
  vi.resetModules()
  return await import('./mcp')
}

beforeEach(() => {
  vi.stubEnv('NOTION_API_KEY', 'test-key')
  mcpClientMock.connect.mockReset()
  mcpClientMock.close.mockReset()
  mcpClientMock.listTools.mockReset()
  mcpClientMock.callTool.mockReset()
  mcpClientMock.connect.mockResolvedValue(undefined)
  mcpClientMock.close.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── getNotionMcpTools ──────────────────────────────────────────────────
describe('getNotionMcpTools', () => {
  it('calls listTools once and caches the result', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [
        {
          name: 'API-get-block-children',
          description: 'List children of a block',
          inputSchema: { type: 'object', properties: { block_id: { type: 'string' } } },
        },
      ],
    })

    const { getNotionMcpTools } = await freshMcp()

    const first = await getNotionMcpTools()
    const second = await getNotionMcpTools()

    expect(first).toHaveLength(1)
    expect(second).toBe(first) // same cached array
    expect(mcpClientMock.listTools).toHaveBeenCalledTimes(1)
  })

  it('re-connects after closeNotionMcp resets the singleton', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [
        {
          name: 'API-get-block-children',
          description: '',
          inputSchema: {},
        },
      ],
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const mcp = await freshMcp()

    await mcp.getNotionMcpTools()
    expect(mcpClientMock.listTools).toHaveBeenCalledTimes(1)

    await mcp.closeNotionMcp()
    expect(mcpClientMock.close).toHaveBeenCalledTimes(1)

    // Next call re-connects
    await mcp.getNotionMcpTools()
    expect(mcpClientMock.listTools).toHaveBeenCalledTimes(2)

    logSpy.mockRestore()
  })
})

// ── getNotionMcpTool ───────────────────────────────────────────────────
describe('getNotionMcpTool', () => {
  it('returns the matching tool by name', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [
        { name: 'tool-a', description: 'A', inputSchema: {} },
        { name: 'tool-b', description: 'B', inputSchema: {} },
      ],
    })

    const { getNotionMcpTool } = await freshMcp()

    const tool = await getNotionMcpTool('tool-a')
    expect(tool.name).toBe('tool-a')
    expect(tool.description).toBe('A')
  })

  it('throws for an unknown tool name', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [{ name: 'only-one', description: '', inputSchema: {} }],
    })

    const { getNotionMcpTool } = await freshMcp()

    await expect(getNotionMcpTool('does-not-exist')).rejects.toThrow(
      'Notion MCP tool "does-not-exist" not found',
    )
  })
})

// ── Tool invoke (from getNotionMcpTools) ────────────────────────────────
describe('tool invoke', () => {
  it('parses JSON from text content and returns it', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [
        {
          name: 'API-get-block-children',
          description: '',
          inputSchema: {},
        },
      ],
    })
    mcpClientMock.callTool.mockResolvedValue({
      content: [{ type: 'text', text: '{"key":"value"}' }],
    })

    const { getNotionMcpTools } = await freshMcp()
    const tools = await getNotionMcpTools()
    const result = await tools[0].invoke({ block_id: 'abc' })

    expect(result).toEqual({ key: 'value' })
    expect(mcpClientMock.callTool).toHaveBeenCalledWith({
      name: 'API-get-block-children',
      arguments: { block_id: 'abc' },
    })
  })

  it('falls back to { text } when JSON parse fails', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [{ name: 'tool-1', description: '', inputSchema: {} }],
    })
    mcpClientMock.callTool.mockResolvedValue({
      content: [{ type: 'text', text: 'not json' }],
    })

    const { getNotionMcpTools } = await freshMcp()
    const tools = await getNotionMcpTools()
    const result = await tools[0].invoke({})

    expect(result).toEqual({ text: 'not json' })
  })

  it('logs to console.error when isError is true', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [{ name: 'err-tool', description: '', inputSchema: {} }],
    })
    mcpClientMock.callTool.mockResolvedValue({
      isError: true,
      content: [{ type: 'text', text: 'Something went wrong' }],
    })

    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const { getNotionMcpTools } = await freshMcp()
    const tools = await getNotionMcpTools()
    await tools[0].invoke({})

    expect(errSpy).toHaveBeenCalledWith(
      '[notion-mcp] err-tool error:',
      'Something went wrong',
    )

    errSpy.mockRestore()
    logSpy.mockRestore()
  })
})

// ── closeNotionMcp ─────────────────────────────────────────────────────
describe('closeNotionMcp', () => {
  it('resets the singleton so next call re-connects', async () => {
    mcpClientMock.listTools.mockResolvedValue({
      tools: [{ name: 't1', description: '', inputSchema: {} }],
    })

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    const mcp = await freshMcp()

    await mcp.getNotionMcpTools()
    expect(mcpClientMock.listTools).toHaveBeenCalledTimes(1)

    await mcp.closeNotionMcp()
    expect(mcpClientMock.close).toHaveBeenCalledTimes(1)

    // Next call re-connects
    await mcp.getNotionMcpTools()
    expect(mcpClientMock.listTools).toHaveBeenCalledTimes(2)

    logSpy.mockRestore()
  })
})
