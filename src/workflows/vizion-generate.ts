import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import {
  PAGE_SCAN_TOOLS,
  DB_READ_TOOLS,
  EMBED_WRITE_TOOLS,
} from '../tools/notion-mcp.tools'
import { spektrumGenerateTool } from '../tools/spektrum.tools'

export interface GenerateInput {
  pageId: string
  databaseId: string
  proxyBaseUrl: string
  refineWebhookUrl: string
}

export interface GenerateOutput {
  appUrl: string
  projectId: string
  taskId: string
  dashboardName: string
}

const DatabaseRef = z.object({ id: z.string(), name: z.string() })

const PageScanSchema = z.object({
  databases: z.array(DatabaseRef).describe('All Notion databases found on this page'),
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

const BuildSchema = z.object({
  appUrl: z.string().url(),
  projectId: z.string(),
  taskId: z.string(),
})

export async function runGenerateWorkflow(input: GenerateInput): Promise<GenerateOutput> {
  const { pageId, databaseId, proxyBaseUrl, refineWebhookUrl } = input

  // ── Agent 1: PageScannerAgent ─────────────────────────────────────
  console.log('[generate:1] scanning page for databases...')

  const scannerAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: PAGE_SCAN_TOOLS,
    structuredOutput: PageScanSchema,
    messages: [{
      role: 'system',
      content:
        'You scan Notion pages to find all linked or embedded databases. ' +
        'Look through block children for child_database blocks, linked_to_database ' +
        'references, and any database view blocks.',
    }],
  })

  const scanResult = await scannerAgent.act(
    `Scan the Notion page with ID: ${pageId}

    Use notion_get_page_content to retrieve all blocks.
    Find ALL databases referenced on this page — the primary one is ${databaseId},
    but there may be others embedded or linked on the same page.

    Return the page title and a list of all database IDs and names found.`
  ) as z.infer<typeof PageScanSchema>

  const allDbs = scanResult.databases
  if (!allDbs.find(db => db.id === databaseId)) {
    allDbs.unshift({ id: databaseId, name: 'Primary Database' })
  }

  console.log(`[generate:1] found ${allDbs.length} database(s): ${allDbs.map(d => d.name).join(', ')}`)

  // ── Agent 2: MultiDBAnalystAgent ──────────────────────────────────
  console.log('[generate:2] analyzing databases...')

  const analystAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: DB_READ_TOOLS,
    structuredOutput: MultiDBAnalysisSchema,
    messages: [{
      role: 'system',
      content:
        'You are a data analyst who specializes in understanding relationships ' +
        'between multiple Notion databases and designing dashboards that surface ' +
        'insights that span across them. Always fetch both schema and sample data ' +
        'before making recommendations.',
    }],
  })

  const analysis = await analystAgent.act(
    `Analyze these Notion databases together:
    ${JSON.stringify(allDbs, null, 2)}

    For each database:
    1. Use notion_retrieve_database to get schema
    2. Use notion_query_database to get sample data (30 rows each)

    Then:
    - Identify how these databases relate to each other (shared fields, relations, etc.)
    - Recommend the most insightful visualizations, especially ones that COMBINE
      data from multiple databases
    - Think beyond basic charts: if there's location data suggest a map,
      if there's a workflow suggest a kanban, if there are time series suggest trends
    - The best dashboards tell a story across all the data, not just one database`
  ) as z.infer<typeof MultiDBAnalysisSchema>

  console.log(`[generate:2] done — ${analysis.recommendedVisualizations.length} visualizations planned`)

  // ── Agent 3: DashboardArchitectAgent ──────────────────────────────
  console.log('[generate:3] designing dashboard spec...')

  const unifiedDataUrl = `${proxyBaseUrl}/api/data?${allDbs.map(db => `databaseId=${db.id}`).join('&')}`

  const architectAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    structuredOutput: PromptSchema,
    messages: [{
      role: 'system',
      content:
        'You write precise technical specifications for Spektrum, an AI React app generator. ' +
        'Your output becomes the task_description sent to Spektrum API. ' +
        'Be extremely specific about data sources, chart types, layout, and interactions.',
    }],
  })

  const design = await architectAgent.act(
    `Write a complete Spektrum task description for this dashboard:

    Analysis:
    ${JSON.stringify(analysis, null, 2)}

    Data source (unified endpoint returning all databases):
    ${unifiedDataUrl}

    Response shape:
    {
      databases: {
        "${allDbs[0]?.name}": { rows: Array<object>, total: number },
        // ... one key per database, keyed by name
      },
      lastUpdated: string
    }

    Requirements:
    - Poll data every 30 seconds, show "Last updated X seconds ago"
    - Use Recharts for charts, Tailwind CSS for styling
    - Clean modern design — white cards, subtle shadows
    - Fully responsive, works at 400px width (embedded in Notion iframe)
    - No fixed heights (causes iframe scroll issues)
    - Show loading skeleton on first load, friendly error state on failure
    - Include filters and interactive elements where they add value
    - The dashboard should tell a cohesive story across all the data

    Emphasize cross-database visualizations — these are the most valuable
    and don't exist anywhere else in the Notion ecosystem.`
  ) as z.infer<typeof PromptSchema>

  // ── Agent 4: SpektrumBuilderAgent ─────────────────────────────────
  console.log('[generate:4] generating with Spektrum...')

  const projectName = `vizion-${analysis.dashboardName
    .toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').slice(0, 30)}-${Date.now()}`

  const builderAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: [spektrumGenerateTool],
    structuredOutput: BuildSchema,
    messages: [{
      role: 'system',
      content: 'Call spektrum_generate once and return the result. Do not modify the task description.',
    }],
  })

  const built = await builderAgent.act(
    `Generate and deploy the dashboard.
    project_name: ${projectName}
    task_title: ${analysis.dashboardName}
    task_description: ${design.taskDescription}`
  ) as z.infer<typeof BuildSchema>

  console.log(`[generate:4] deployed: ${built.appUrl}`)

  // ── Agent 5: NotionEmbedAgent ─────────────────────────────────────
  console.log('[generate:5] embedding into Notion...')

  const embedAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: EMBED_WRITE_TOOLS,
    messages: [{
      role: 'system',
      content: 'Call notion_append_dashboard with exact parameters. Do not improvise.',
    }],
  })

  await embedAgent.act(
    `Append the dashboard to the Notion page.
    page_id: ${pageId}
    app_url: ${built.appUrl}
    dashboard_name: ${analysis.dashboardName}
    project_id: ${built.projectId}
    task_id: ${built.taskId}
    refine_webhook_url: ${refineWebhookUrl}`
  )

  console.log('[generate:5] done')

  return {
    appUrl: built.appUrl,
    projectId: built.projectId,
    taskId: built.taskId,
    dashboardName: analysis.dashboardName,
  }
}
