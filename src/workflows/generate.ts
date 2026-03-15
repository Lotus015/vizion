import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { parseAgentResult } from '../mozaik/helpers'
import { getNotionMcpTools, getNotionMcpTool } from '../notion/mcp'
import { notifyUser, retrieveDatabaseSchema, queryDatabase } from '../notion/api'
import { spektrumGenerateTool } from '../spektrum/client'
import { registerDashboard } from '../lib/dashboard-registry'

export interface GenerateInput {
  pageId: string
  userId: string
  proxyBaseUrl: string
  refineWebhookUrl: string
}

export interface GenerateOutput {
  appUrl: string
  projectId: string
  taskId: string
  dashboardName: string
}

const PageScanSchema = z.object({
  databases: z.array(z.object({ id: z.string(), name: z.string() }))
    .describe('All Notion databases found on this page'),
  pageTitle: z.string(),
})

const MultiDBAnalysisSchema = z.object({
  dashboardName: z.string(),
  databases: z.array(z.object({
    id: z.string(),
    name: z.string(),
    columnSummary: z.string(),
    keyInsights: z.string(),
  })),
  relationships: z.string().describe('How these databases relate to each other'),
  recommendedVisualizations: z.array(z.object({
    title: z.string(),
    type: z.enum(['bar', 'line', 'pie', 'donut', 'kpi', 'table', 'progress', 'map', 'kanban', 'scatter']),
    databases: z.array(z.string()).describe('Which database IDs this viz uses'),
    description: z.string(),
  })),
})

const PromptSchema = z.object({ taskDescription: z.string() })

export async function runGenerateWorkflow(input: GenerateInput): Promise<GenerateOutput> {
  const { pageId, userId, proxyBaseUrl, refineWebhookUrl } = input

  // Load Notion MCP tools once for the workflow
  const notionTools = await getNotionMcpTools()

  // ── Agent 1: Scan page for databases ────────────────────────────────
  console.log('[generate:1] scanning page for databases...')

  const scannerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    tools: notionTools.filter(t => t.name === 'API-get-block-children'),
    structuredOutput: PageScanSchema,
    messages: [{
      role: 'system',
      content:
        'You scan Notion pages to find all linked or embedded databases. ' +
        'Look through block children for child_database blocks.',
    }],
  })

  const scanRaw = await scannerAgent.act(
    `Scan the Notion page with ID: ${pageId}

    Use the API-get-block-children tool with block_id="${pageId}" to get all blocks.
    Find ALL databases referenced on this page.

    Look for blocks with type "child_database" — each has an "id" field (the database ID)
    and a "child_database.title" field (the database name).

    IMPORTANT: You must return the block "id" as the database id. Do NOT return empty strings.

    Return the page title and a list of all database IDs and names found.`
  )

  const scanResult = parseAgentResult<z.infer<typeof PageScanSchema>>(scanRaw)
  const allDbs = (scanResult.databases ?? []).filter(db => db.id)

  if (!allDbs.length) {
    throw new Error('No databases found on page.')
  }

  console.log(`[generate:1] found ${allDbs.length} database(s): ${allDbs.map(d => d.name).join(', ')}`)

  // ── Step 2: Fetch schemas and data (MCP direct calls) ───────────────
  console.log('[generate:2] fetching database schemas and data...')

  // Direct API calls — MCP data_source endpoints return 404 (known makenotion/notion-mcp-server#218)
  const dbData = await Promise.all(
    allDbs.map(async (db) => {
      const schema = await retrieveDatabaseSchema(db.id)
      const data = await queryDatabase(db.id, 30)
      return { ...db, schema, data }
    })
  )

  // ── Agent 2: Analyze databases (no tools, data provided) ────────────
  console.log('[generate:2] analyzing databases...')

  const analystAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    structuredOutput: MultiDBAnalysisSchema,
    messages: [{
      role: 'system',
      content:
        'You are a data analyst who understands relationships between databases ' +
        'and recommends dashboard visualizations that span across them.',
    }],
  })

  const analysisRaw = await analystAgent.act(
    `Analyze these Notion databases and recommend dashboard visualizations.

    ${JSON.stringify(dbData, null, 2)}

    - Identify how these databases relate to each other
    - Recommend visualizations, especially cross-database ones
    - Think beyond basic charts: maps for location data, kanban for workflows, trends for time series`
  )

  const analysis = parseAgentResult<z.infer<typeof MultiDBAnalysisSchema>>(analysisRaw)
  console.log(`[generate:2] done — ${analysis.recommendedVisualizations?.length ?? 0} visualizations planned`)

  // ── Agent 3: Write Spektrum task description ────────────────────────
  console.log('[generate:3] designing dashboard spec...')

  const dbQuery = allDbs.map(db => `databaseId=${db.id}`).join('&')
  const unifiedDataUrl = `${proxyBaseUrl}/api/data?${dbQuery}`
  const sseStreamUrl = `${proxyBaseUrl}/api/data/stream?${dbQuery}`

  const vizSummary = (analysis.recommendedVisualizations ?? [])
    .map(v => `- ${v.title} (${v.type}): ${v.description.slice(0, 100)}`)
    .join('\n')

  const dbSummary = analysis.databases
    .map(db => `- ${db.name}: ${db.columnSummary}`)
    .join('\n')

  const architectAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    structuredOutput: PromptSchema,
    messages: [{
      role: 'system',
      content:
        'You write CONCISE task descriptions for Spektrum, an AI React app generator. ' +
        'Keep output under 2000 characters. Focus on WHAT to build, not HOW.',
    }],
  })

  const designRaw = await architectAgent.act(
    `Write a concise Spektrum task description (under 2000 chars) for a dashboard.

    Dashboard: ${analysis.dashboardName}
    Databases: ${dbSummary}
    Relationships: ${analysis.relationships}
    Visualizations: ${vizSummary}

    ## Data connection
    Real-time SSE stream: ${sseStreamUrl}
    Fallback REST endpoint: ${unifiedDataUrl}
    Response format: { databases: { "<name>": { rows: [...], total: N } }, lastUpdated: "ISO" }

    Use EventSource to connect to the SSE stream URL. Each "data" event is a JSON payload with the full database state.
    On error or disconnect, fall back to polling the REST endpoint every 30s.

    ## Visual design requirements
    - Dark theme: deep navy/slate background (#0f172a), cards with subtle borders and glass-morphism (backdrop-blur, semi-transparent backgrounds)
    - Accent colors: vibrant gradients (blue-purple, cyan-teal) for charts and highlights
    - Typography: clean sans-serif, large KPI numbers, muted labels
    - Cards with rounded corners (xl), subtle shadows, hover effects with smooth transitions
    - Recharts with custom colors matching the dark theme, no default gray grids
    - Responsive: min 400px width, CSS grid auto-fit for card layout
    - Smooth loading skeleton with pulse animation (not spinner)
    - No fixed heights, content-driven sizing
    - "Last updated" timestamp with relative time (e.g. "3s ago") that ticks live`
  )

  const design = parseAgentResult<z.infer<typeof PromptSchema>>(designRaw)

  if (design.taskDescription.length > 3000) {
    design.taskDescription = design.taskDescription.slice(0, 3000)
  }

  console.log(`[generate:3] spec ready (${design.taskDescription.length} chars)`)

  // ── Step 4: Spektrum build (direct call) ────────────────────────────
  console.log('[generate:4] generating with Spektrum...')

  const built = await spektrumGenerateTool.invoke({
    owner: userId,
    task_title: analysis.dashboardName,
    task_description: design.taskDescription,
  }) as { appUrl: string; projectId: string; taskId: string }

  console.log(`[generate:4] deployed: ${built.appUrl}`)

  // ── Step 5: Embed into Notion (MCP call) ────────────────────────────
  console.log('[generate:5] embedding into Notion...')

  const appendBlocks = await getNotionMcpTool('API-patch-block-children')
  await appendBlocks.invoke({
    block_id: pageId,
    children: [
      { type: 'divider', divider: {} },
      {
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: `📊 ${analysis.dashboardName}` } }],
        },
      },
      { type: 'embed', embed: { url: built.appUrl } },
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: '✏️ Want changes? Write your request below, then click ' } },
            { type: 'text', text: { content: 'Refine Dashboard' }, annotations: { bold: true } },
            { type: 'text', text: { content: '.' } },
          ],
        },
      },
      {
        type: 'paragraph',
        paragraph: {
          rich_text: [
            { type: 'text', text: { content: 'Generated by ' } },
            { type: 'text', text: { content: 'vizion', link: { url: 'https://github.com/Lotus015/vizion' } } },
          ],
        },
      },
    ],
  })

  // Store metadata in memory so refine workflow can look it up
  registerDashboard(pageId, built.projectId, built.taskId)

  // Notify user via Notion comment
  await notifyUser(pageId, userId, `Your dashboard "${analysis.dashboardName}" is ready! 🎉`)

  console.log('[generate] complete:', built.appUrl)

  return {
    appUrl: built.appUrl,
    projectId: built.projectId,
    taskId: built.taskId,
    dashboardName: analysis.dashboardName,
  }
}
