import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { Tool } from '@mozaik-ai/core'

let client: Client | null = null
let cachedTools: Tool[] | null = null

/** Spawn Notion MCP server and connect via stdio */
async function getClient(): Promise<Client> {
  if (client) return client

  client = new Client(
    { name: 'vizion', version: '0.1.0' },
    { capabilities: {} },
  )

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    env: {
      ...process.env,
      NOTION_TOKEN: process.env.NOTION_API_KEY!,
    },
  })

  await client.connect(transport)
  console.log('[notion-mcp] connected to Notion MCP server')
  return client
}

/** List all MCP tools, wrapped as Mozaik Tool objects */
export async function getNotionMcpTools(): Promise<Tool[]> {
  if (cachedTools) return cachedTools

  const c = await getClient()
  const { tools: mcpTools } = await c.listTools()

  cachedTools = mcpTools.map((mcp) => ({
    name: mcp.name,
    description: mcp.description ?? '',
    schema: mcp.inputSchema as Record<string, any>,
    async invoke(args: any) {
      console.log(`[notion-mcp] calling ${mcp.name} with:`, JSON.stringify(args))
      const result = await c.callTool({ name: mcp.name, arguments: args })
      const text = (result.content as any[])
        ?.filter((c) => c.type === 'text')
        .map((c) => c.text)
        .join('')
      if (result.isError) {
        console.error(`[notion-mcp] ${mcp.name} error:`, text)
      }
      try {
        return JSON.parse(text || '{}')
      } catch {
        return { text }
      }
    },
  }))

  console.log(`[notion-mcp] loaded ${cachedTools.length} tools`)
  return cachedTools
}

/** Get a specific MCP tool by name */
export async function getNotionMcpTool(name: string): Promise<Tool> {
  const tools = await getNotionMcpTools()
  const tool = tools.find(t => t.name === name)
  if (!tool) throw new Error(`Notion MCP tool "${name}" not found`)
  return tool
}

/** Shut down the MCP server subprocess */
export async function closeNotionMcp() {
  if (client) {
    await client.close()
    client = null
    cachedTools = null
    console.log('[notion-mcp] disconnected')
  }
}
