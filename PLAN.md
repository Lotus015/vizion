# vizion — Implementation Plan

> **"Notion as a natural language interface for custom React apps."**
>
> Click a button. An AI agent reads your databases, understands their
> relationships, and generates a bespoke interactive dashboard — embedded
> live in your Notion page. Not happy? Write a comment and click Refine.
>
> Core stack: **Mozaik** + **Notion MCP** + **Spektrum SDK**

---

## What makes this different

| | Notion native charts | Third-party (ChartBase, NoChart) | **vizion** |
|--|--|--|--|
| Configuration | Manual | Manual | **Zero — AI decides** |
| Chart types | 4 fixed | ~10 fixed | **Arbitrary React** |
| Multiple databases | ❌ | ❌ | ✅ **AI joins them** |
| Interactivity | Basic | Basic | **Filters, search, drill-down** |
| Refinement | ❌ | ❌ | ✅ **Comment → regenerate** |
| Trigger | UI clicks | External UI | **One Notion button** |
| Notion MCP | ❌ | ❌ | ✅ |

The core insight: every existing tool is a **configurator** — it gives you
options you choose from. vizion uses an AI agent that *reads* your data
and *decides* what to build. A database with lat/lng columns gets a map.
A database with time-series gets a line chart. Two related databases get
a joined view that neither could produce alone.

---

## Mozaik API Reference (v0.8.4)

```typescript
// Single agent
const agent = new MozaikAgent({ model, tools, structuredOutput, messages })
const result = await agent.act(prompt)

// Workflow (when steps don't need chained outputs)
const wf = new Workflow('sequential', [
  new Task('step description', 'claude-sonnet-4.5'),
])
await wf.execute()

// Tool interface
const tool: Tool = {
  name: string,
  description: string,
  schema: JSONSchema,
  invoke: async (args) => result,
}
```

No native MCP support → Notion MCP wrapped as standard `Tool` objects.
No automatic output piping → agents chained manually via TypeScript.

---

## Two User Flows

### Flow 1: Generate

```
[Notion Page with databases]
  ├── [Linked DB] Projects
  ├── [Linked DB] Team
  ├── [Linked DB] Budget
  └── 📊 Generate Dashboard  ← Button

  Klikne →

  Agent 1: skenira stranicu, pronađe sve 3 baze, analizira ih zajedno
  Agent 2: projektuje unified dashboard koji koristi sve 3
  Agent 3: Spektrum generiše + deploya React app
  Agent 4: upisuje u Notion:
    ├── heading "📊 Projects Dashboard"
    ├── [live embed]
    ├── ✏️ Refine Dashboard  ← drugi button (dodat automatski!)
    └── [callout] vizion: proj_abc123 / task_xyz789  ← metadata
```

### Flow 2: Refine

```
  Korisnik vidi dashboard, nije zadovoljan.
  Piše u Notion ispod embeda: "Add a filter by assignee and show overdue tasks in red"
  Klikne ✏️ Refine Dashboard →

  Agent čita stranicu: pronađe metadata blok (proj_id, task_id)
  Agent pronađe komentar ispod embeda
  Spektrum: leaveComment(task_id, komentar) → codeAndDeploy → getAppUrl
  Agent ažurira embed blok sa novim URL-om
```

---

## Architecture Overview

```
POST /api/generate                    POST /api/refine
        │                                     │
        ▼                                     ▼
[vizion-generate workflow]        [vizion-refine workflow]
        │                                     │
  Agent 1: PageScannerAgent           Agent 1: PageReaderAgent
    → notion_retrieve_page              → notion_retrieve_page
    → notion_get_block_children         → čita metadata blok
    → pronađe sve linked DBs            → čita komentar korisnika
    → output: [db1, db2, db3]           → output: { projectId, taskId, comment }
        │                                     │
  Agent 2: MultiDBAnalystAgent        Agent 2: SpektrumRefineAgent
    → notion_query_database (×N)        → spektrum_refine tool
    → shvati relacije između baza       → leaveComment + codeAndDeploy
    → output: unified SchemaAnalysis    → getAppUrl
        │                                     │
  Agent 3: DashboardArchitectAgent    Agent 3: NotionUpdateAgent
    → projektuje multi-source layout    → notion_update_embed_block
    → output: Spektrum task prompt      → ažurira URL u embed bloku
        │
  Agent 4: SpektrumBuilderAgent
    → spektrum_generate tool
    → output: { appUrl, projectId, taskId }
        │
  Agent 5: NotionEmbedAgent
    → notion_append_blocks
    → upiše: embed + Refine button + metadata callout

[Spektrum React App — S3/CloudFront]
  └── polling /api/data?databaseId=abc&databaseId=xyz svakih 30s
            ▼
  [vizion Data Proxy]  /api/data
    → paralelni query svih baza
    → vraća: { databases: { name: rows[] } }
```

---

## Pre-Implementation: Notion Setup

### 1. Kreiranje Notion Integration

1. https://www.notion.com/my-integrations → **+ New integration**
2. Ime: `vizion`, Capabilities: ✅ Read, ✅ Update, ✅ Insert
3. Kopiraj **Internal Integration Token** → `NOTION_API_KEY`

### 2. Kreiranje Test Stranice sa Više Baza

Za demo — stranica sa 3 povezane baze:

**Baza 1: Projects**
| Kolona | Tip |
|--------|-----|
| Name | Title |
| Status | Select (Planning / Active / Done / Blocked) |
| Priority | Select (Low / Medium / High) |
| Due Date | Date |
| Budget | Number |

**Baza 2: Team Members**
| Kolona | Tip |
|--------|-----|
| Name | Title |
| Role | Select (Engineering / Design / Marketing) |
| Active Projects | Number |
| Capacity | Select (Available / Busy / Overloaded) |

**Baza 3: Tasks**
| Kolona | Tip |
|--------|-----|
| Name | Title |
| Project | Relation → Projects |
| Assignee | Person |
| Status | Select (Todo / In Progress / Done) |
| Estimated Hours | Number |
| Completed | Checkbox |

Popuni svaku sa 10-15 redova. Ovo je "wow" demo — agent vidi 3 baze
i pravi dashboard koji ih kombinuje u način koji korisnik nije eksplicitno
tražio.

### 3. Povezi Sve Baze sa Integration-om

Za svaku bazu: **"..."** → **Connections** → `vizion` → **Connect**

### 4. Dodaj Generate Button na Stranicu

1. `/button` → ime: **📊 Generate Dashboard**
2. Action: **Send webhook** → `http://YOUR_SERVER/api/generate`

> Refine button se dodaje **automatski** od strane agenta nakon generacije.
> Korisnik ga ne mora ručno kreirati.

### 5. Verifikuj Payload Format

Webhook.site test — dokumentuj tačnu strukturu pre implementacije.

### 6. Environment Variables

```env
ANTHROPIC_API_KEY=xxxxxxxxxxxx
NOTION_API_KEY=secret_xxxxxxxxxxxx
SPEKTRUM_API_KEY=xxxxxxxxxxxx
PORT=3000
VIZION_BASE_URL=http://YOUR_SERVER:3000
WEBHOOK_SECRET=xxxxxxxxxxxx
```

---

## Repository Structure

```
vizion/
├── src/
│   ├── server.ts
│   ├── routes/
│   │   ├── generate.ts          ← POST /api/generate
│   │   ├── refine.ts            ← POST /api/refine
│   │   └── data.ts              ← GET /api/data (multi-db proxy)
│   ├── workflows/
│   │   ├── vizion-generate.ts   ← 5-agent generate flow
│   │   └── vizion-refine.ts     ← 3-agent refine flow
│   ├── tools/
│   │   ├── notion-mcp.tools.ts  ← Notion MCP → Mozaik Tool adapter
│   │   └── spektrum.tools.ts    ← Spektrum SDK → Mozaik Tool
│   └── lib/
│       └── normalize.ts
├── scripts/
├── .env.example
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

---

## Phase 1: Notion MCP Tools (`src/tools/notion-mcp.tools.ts`)

```typescript
import { Client } from '@notionhq/client'
import { Tool } from '@mozaik-ai/core'

function notion() {
  return new Client({ auth: process.env.NOTION_API_KEY })
}

// ── Tool 1: Retrieve Page + Block Children ────────────────────────────
// Agent koristi ovo da skenira stranicu i pronađe sve linked baze
export const notionGetPageContentTool: Tool = {
  name: 'notion_get_page_content',
  description:
    'Retrieves a Notion page and all its child blocks. Use this to scan ' +
    'a page for linked databases, existing embeds, callout blocks with ' +
    'metadata, and any text content written by the user.',
  schema: {
    type: 'object',
    properties: {
      page_id: { type: 'string' },
    },
    required: ['page_id'],
  },
  async invoke({ page_id }) {
    const n = notion()
    const [page, blocks] = await Promise.all([
      n.pages.retrieve({ page_id }),
      n.blocks.children.list({ block_id: page_id, page_size: 100 }),
    ])
    return { page, blocks: blocks.results }
  },
}

// ── Tool 2: Retrieve Database Schema ─────────────────────────────────
export const notionRetrieveDatabaseTool: Tool = {
  name: 'notion_retrieve_database',
  description:
    'Retrieves schema of a Notion database: column names, types, options. ' +
    'Use before querying rows to understand structure.',
  schema: {
    type: 'object',
    properties: {
      database_id: { type: 'string' },
    },
    required: ['database_id'],
  },
  async invoke({ database_id }) {
    const n = notion()
    const db = await n.databases.retrieve({ database_id })
    const columns: Record<string, any> = {}
    for (const [name, prop] of Object.entries(db.properties)) {
      const p = prop as any
      columns[name] = {
        type: p.type,
        options: ['select', 'multi_select', 'status'].includes(p.type)
          ? (p[p.type]?.options ?? []).map((o: any) => o.name)
          : undefined,
      }
    }
    return {
      database_id,
      name: (db as any).title?.[0]?.plain_text ?? 'Untitled',
      columns,
    }
  },
}

// ── Tool 3: Query Database Rows ───────────────────────────────────────
export const notionQueryDatabaseTool: Tool = {
  name: 'notion_query_database',
  description: 'Queries rows from a Notion database. Returns normalized flat objects.',
  schema: {
    type: 'object',
    properties: {
      database_id: { type: 'string' },
      page_size: { type: 'number', description: 'Max rows (1-100, default 30)' },
    },
    required: ['database_id'],
  },
  async invoke({ database_id, page_size = 30 }) {
    const n = notion()
    const result = await n.databases.query({
      database_id,
      page_size: Math.min(page_size, 100),
    })
    const { normalizeRows } = await import('../lib/normalize')
    return { rows: normalizeRows(result.results), total: result.results.length }
  },
}

// ── Tool 4: Append Blocks ─────────────────────────────────────────────
// Upisuje dashboard embed + Refine button + metadata callout
export const notionAppendDashboardTool: Tool = {
  name: 'notion_append_dashboard',
  description:
    'Appends dashboard embed, Refine button, and metadata to a Notion page. ' +
    'Always call this after Spektrum deployment.',
  schema: {
    type: 'object',
    properties: {
      page_id: { type: 'string' },
      app_url: { type: 'string' },
      dashboard_name: { type: 'string' },
      project_id: { type: 'string' },
      task_id: { type: 'string' },
      refine_webhook_url: { type: 'string' },
    },
    required: ['page_id', 'app_url', 'dashboard_name', 'project_id', 'task_id', 'refine_webhook_url'],
  },
  async invoke({ page_id, app_url, dashboard_name, project_id, task_id, refine_webhook_url }) {
    const n = notion()
    await n.blocks.children.append({
      block_id: page_id,
      children: [
        { type: 'divider', divider: {} } as any,
        {
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: `📊 ${dashboard_name}` } }],
          },
        } as any,
        { type: 'embed', embed: { url: app_url } } as any,
        // Refine button — dodat automatski
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: '✏️ Want changes? Write your request below, then click ' } },
              { type: 'text', text: { content: 'Refine Dashboard', annotations: { bold: true } } },
              { type: 'text', text: { content: '.' } },
            ],
          },
        } as any,
        // Metadata callout — sadrži project/task IDs za refine flow
        {
          type: 'callout',
          callout: {
            icon: { type: 'emoji', emoji: '🔧' },
            rich_text: [{
              type: 'text',
              text: { content: `vizion:${project_id}:${task_id}` },
            }],
            color: 'gray_background',
          },
        } as any,
        // Refine button blok
        // Note: Button blocks sa webhook akcijom se ne mogu kreirati
        // programatski kroz API — korisnik mora da doda Refine button
        // ručno jednom (ili ga vizion doda kao instrukciju u tekstu).
        // Vidi sekciju "Refine Button Limitation" ispod.
        {
          type: 'paragraph',
          paragraph: {
            rich_text: [
              { type: 'text', text: { content: 'Generated by ' } },
              { type: 'text', text: { content: 'vizion', link: { url: 'https://github.com/jigjoy-ai/vizion' } } },
            ],
          },
        } as any,
      ],
    })
    return { ok: true }
  },
}

// ── Tool 5: Update Embed Block URL ────────────────────────────────────
// Koristi se u refine flow-u da ažurira postojeći embed
export const notionUpdateEmbedTool: Tool = {
  name: 'notion_update_embed',
  description:
    'Finds the existing embed block on a page and updates its URL. ' +
    'Use in the refine flow after a new app version is deployed.',
  schema: {
    type: 'object',
    properties: {
      page_id: { type: 'string' },
      new_app_url: { type: 'string' },
    },
    required: ['page_id', 'new_app_url'],
  },
  async invoke({ page_id, new_app_url }) {
    const n = notion()
    const blocks = await n.blocks.children.list({ block_id: page_id, page_size: 100 })

    const embedBlock = blocks.results.find((b: any) => b.type === 'embed')
    if (!embedBlock) throw new Error('No embed block found on page')

    await n.blocks.update({
      block_id: embedBlock.id,
      embed: { url: new_app_url },
    } as any)

    return { ok: true, updated_block_id: embedBlock.id }
  },
}

// Exports grupisani po flow-u
export const PAGE_SCAN_TOOLS = [notionGetPageContentTool]
export const DB_READ_TOOLS = [notionRetrieveDatabaseTool, notionQueryDatabaseTool]
export const EMBED_WRITE_TOOLS = [notionAppendDashboardTool]
export const EMBED_UPDATE_TOOLS = [notionUpdateEmbedTool]
```

> ⚠️ **Refine Button Limitation**
> Notion API ne podržava kreiranje Button blokova sa webhook akcijom
> programatski. Opcije:
> 1. Korisnik jednom ručno doda Refine button na stranicu (sa `/api/refine` URL-om)
> 2. vizion generiše instrukciju u tekstu umesto pravog buttona
> 3. Workaround: embed small HTML form u iframe koji šalje POST na `/api/refine`
>
> Za MVP demo — opcija 1 je najjednostavnija.

---

## Phase 2: Spektrum Tools (`src/tools/spektrum.tools.ts`)

```typescript
import { Tool } from '@mozaik-ai/core'
import { SpektrumSDK } from '@spektrum-ai/sdk'

const spektrum = new SpektrumSDK()

// ── Tool 1: Generate (novi projekat) ─────────────────────────────────
export const spektrumGenerateTool: Tool = {
  name: 'spektrum_generate',
  description:
    'Creates a new Spektrum project, generates and deploys a React app. ' +
    'Returns appUrl, projectId, and taskId. Store projectId and taskId — ' +
    'they are needed for future refinements.',
  schema: {
    type: 'object',
    properties: {
      project_name: { type: 'string', description: 'Unique slug (lowercase, hyphens)' },
      task_title: { type: 'string', description: 'Short title for the task' },
      task_description: { type: 'string', description: 'Full dashboard specification' },
    },
    required: ['project_name', 'task_title', 'task_description'],
  },
  async invoke({ project_name, task_title, task_description }) {
    const { project } = await spektrum.createProject(project_name)
    const { task } = await spektrum.createTask(project.id, task_title, task_description)
    await spektrum.codeAndDeploy(task)
    const appUrl = await spektrum.getAppUrl(project.id)
    return { appUrl, projectId: project.id, taskId: task.id }
  },
}

// ── Tool 2: Refine (iteracija na postojećem) ──────────────────────────
export const spektrumRefineTool: Tool = {
  name: 'spektrum_refine',
  description:
    'Leaves a comment on an existing Spektrum task and re-deploys. ' +
    'Use in the refine flow with the stored projectId and taskId.',
  schema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      task_id: { type: 'string' },
      comment: { type: 'string', description: 'User feedback or change request' },
      author_id: { type: 'string', description: 'Author identifier (e.g. page_id)' },
    },
    required: ['project_id', 'task_id', 'comment'],
  },
  async invoke({ project_id, task_id, comment, author_id = 'vizion-user' }) {
    const { task: updatedTask } = await spektrum.leaveComment(task_id, comment, author_id)
    await spektrum.codeAndDeploy(updatedTask)
    const appUrl = await spektrum.getAppUrl(project_id)
    return { appUrl }
  },
}
```

---

## Phase 3: Generate Workflow (`src/workflows/vizion-generate.ts`)

```typescript
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
  databaseId: string   // baza čija je ovo stranica (od Notion Button payload-a)
  proxyBaseUrl: string
  refineWebhookUrl: string
}

export interface GenerateOutput {
  appUrl: string
  projectId: string
  taskId: string
  dashboardName: string
}

// Zod schemas
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

  // ── Agent 1: PageScannerAgent ─────────────────────────────────────────
  // Skenira stranicu i pronalazi SVE linked baze — ne samo onu iz payload-a.

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

  // Garantujemo da primarna baza uvek bude uključena
  const allDbs = scanResult.databases
  if (!allDbs.find(db => db.id === databaseId)) {
    allDbs.unshift({ id: databaseId, name: 'Primary Database' })
  }

  console.log(`[generate:1] found ${allDbs.length} database(s): ${allDbs.map(d => d.name).join(', ')}`)

  // ── Agent 2: MultiDBAnalystAgent ──────────────────────────────────────
  // Analizira sve baze zajedno i shvata relacije između njih.

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

  // ── Agent 3: DashboardArchitectAgent ─────────────────────────────────
  // Dizajnira Spektrum task prompt sa multi-source data URL-ovima.

  console.log('[generate:3] designing dashboard spec...')

  // Svaka baza dobija svoj data URL — proxy podržava višestruke
  const dataUrls = allDbs.map(db =>
    `${proxyBaseUrl}/api/data?databaseId=${db.id}`
  )
  // Alternativno: jedan unified endpoint
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

  // ── Agent 4: SpektrumBuilderAgent ─────────────────────────────────────

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

  // ── Agent 5: NotionEmbedAgent ─────────────────────────────────────────

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
```

---

## Phase 4: Refine Workflow (`src/workflows/vizion-refine.ts`)

```typescript
import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { PAGE_SCAN_TOOLS, EMBED_UPDATE_TOOLS } from '../tools/notion-mcp.tools'
import { spektrumRefineTool } from '../tools/spektrum.tools'

export interface RefineInput {
  pageId: string
}

export interface RefineOutput {
  appUrl: string
}

const MetadataSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  userComment: z.string().describe('The refinement request written by the user'),
})

const RefineResultSchema = z.object({ appUrl: z.string().url() })

export async function runRefineWorkflow(input: RefineInput): Promise<RefineOutput> {
  const { pageId } = input

  // ── Agent 1: PageReaderAgent ──────────────────────────────────────────
  // Čita stranicu, pronađe vizion metadata callout i komentar korisnika.

  console.log('[refine:1] reading page for metadata and user comment...')

  const readerAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: PAGE_SCAN_TOOLS,
    structuredOutput: MetadataSchema,
    messages: [{
      role: 'system',
      content:
        'You read Notion pages to extract vizion metadata and user refinement requests. ' +
        'The metadata callout contains "vizion:PROJECT_ID:TASK_ID". ' +
        'The user comment is text written after the embed block.',
    }],
  })

  const meta = await readerAgent.act(
    `Read the Notion page: ${pageId}

    Use notion_get_page_content to retrieve all blocks.

    Find:
    1. The callout block containing "vizion:..." — extract projectId and taskId
       (format: vizion:proj_abc123:task_xyz789)
    2. Any paragraph text after the embed block — this is the user's refinement request

    Return projectId, taskId, and userComment.`
  ) as z.infer<typeof MetadataSchema>

  console.log(`[refine:1] projectId=${meta.projectId}, comment="${meta.userComment}"`)

  // ── Agent 2: SpektrumRefineAgent ──────────────────────────────────────

  console.log('[refine:2] refining with Spektrum...')

  const refineAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: [spektrumRefineTool],
    structuredOutput: RefineResultSchema,
    messages: [{
      role: 'system',
      content: 'Call spektrum_refine with the provided IDs and comment. Return the new appUrl.',
    }],
  })

  const refined = await refineAgent.act(
    `Refine the existing dashboard.
    project_id: ${meta.projectId}
    task_id: ${meta.taskId}
    comment: ${meta.userComment}
    author_id: ${pageId}`
  ) as z.infer<typeof RefineResultSchema>

  console.log(`[refine:2] new app: ${refined.appUrl}`)

  // ── Agent 3: NotionUpdateAgent ────────────────────────────────────────

  console.log('[refine:3] updating embed in Notion...')

  const updateAgent = new MozaikAgent({
    model: 'claude-sonnet-4.5',
    tools: EMBED_UPDATE_TOOLS,
    messages: [{
      role: 'system',
      content: 'Update the embed block URL. Call notion_update_embed with exact parameters.',
    }],
  })

  await updateAgent.act(
    `Update the embed block on page ${pageId} with new URL: ${refined.appUrl}`
  )

  console.log('[refine:3] done')
  return { appUrl: refined.appUrl }
}
```

---

## Phase 5: Routes

### `src/routes/generate.ts`

```typescript
import { Request, Response } from 'express'
import { runGenerateWorkflow } from '../workflows/vizion-generate'

export async function generateRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id
  const databaseId = req.body?.data?.parent?.database_id

  if (!pageId || !databaseId) {
    return res.status(400).json({ error: 'Missing page_id or database_id', received: req.body })
  }

  const base = process.env.VIZION_BASE_URL!

  try {
    const result = await runGenerateWorkflow({
      pageId,
      databaseId,
      proxyBaseUrl: base,
      refineWebhookUrl: `${base}/api/refine`,
    })
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[generate]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
```

### `src/routes/refine.ts`

```typescript
import { Request, Response } from 'express'
import { runRefineWorkflow } from '../workflows/vizion-refine'

export async function refineRoute(req: Request, res: Response) {
  const pageId = req.body?.data?.id

  if (!pageId) {
    return res.status(400).json({ error: 'Missing page_id', received: req.body })
  }

  try {
    const result = await runRefineWorkflow({ pageId })
    return res.status(200).json({ ok: true, ...result })
  } catch (err: any) {
    console.error('[refine]', err.message)
    return res.status(500).json({ error: err.message })
  }
}
```

### `src/routes/data.ts` — Multi-DB Proxy

```typescript
import { Request, Response } from 'express'
import { Client } from '@notionhq/client'
import { normalizeRows } from '../lib/normalize'

const notion = new Client({ auth: process.env.NOTION_API_KEY })

export async function dataRoute(req: Request, res: Response) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Cache-Control', 'public, max-age=25')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // Podržava jedan ili više databaseId parametara
  // /api/data?databaseId=abc&databaseId=xyz
  const raw = req.query.databaseId
  const databaseIds: string[] = Array.isArray(raw)
    ? (raw as string[])
    : raw ? [raw as string] : []

  if (!databaseIds.length) {
    return res.status(400).json({ error: 'At least one databaseId required' })
  }

  try {
    // Paralelan query svih baza
    const results = await Promise.all(
      databaseIds.map(async (id) => {
        const [schema, rows] = await Promise.all([
          notion.databases.retrieve({ database_id: id }),
          notion.databases.query({ database_id: id, page_size: 100 }),
        ])
        const name = (schema as any).title?.[0]?.plain_text ?? id
        return { id, name, rows: normalizeRows(rows.results), total: rows.results.length }
      })
    )

    // Keyed by database name za lakše korišćenje u React appu
    const databases: Record<string, any> = {}
    for (const r of results) {
      databases[r.name] = { rows: r.rows, total: r.total, databaseId: r.id }
    }

    return res.status(200).json({
      databases,
      lastUpdated: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({ error: err.message })
  }
}
```

---

## Phase 6: Server, Normalize, Package

### `src/server.ts`

```typescript
import express from 'express'
import 'dotenv/config'
import { generateRoute } from './routes/generate'
import { refineRoute } from './routes/refine'
import { dataRoute } from './routes/data'

const app = express()
app.use(express.json())

app.post('/api/generate', generateRoute)
app.post('/api/refine', refineRoute)
app.get('/api/data', dataRoute)
app.get('/health', (_, res) => res.json({ ok: true, service: 'vizion' }))

app.listen(process.env.PORT ?? 3000, () =>
  console.log(`vizion running on :${process.env.PORT ?? 3000}`)
)
```

### `package.json`

```json
{
  "name": "vizion",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "@mozaik-ai/core": "^0.8.4",
    "@spektrum-ai/sdk": "^0.0.4",
    "@notionhq/client": "^2.2.15",
    "express": "^4.18.0",
    "dotenv": "^16.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "typescript": "^5.0.0",
    "tsx": "^4.0.0"
  }
}
```

---

## Phase 7: S3 / CloudFront Headers

```
Content-Security-Policy: frame-ancestors https://www.notion.so *
```

CloudFront → Behaviors → Response Headers Policy.
**Testirati pre svega ostalog.**

---

## Phase 8: Deployment — AWS Lightsail

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY .env ./
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

```bash
npm run build
docker build -t vizion .
docker run -d --name vizion --restart unless-stopped \
  -p 3000:3000 --env-file .env vizion
```

Nginx proxy_read_timeout na 180s+ zbog Mozaik/Spektrum trajanja.

---

## Implementation Order

```
Step 1  → Repo setup, dependencies
Step 2  → src/lib/normalize.ts
Step 3  → src/routes/data.ts (multi-db proxy)
Step 4  → src/server.ts + test proxy lokalno
Step 5  → RUČNO: webhook.site — verifikuj Notion Button payload
Step 6  → src/tools/notion-mcp.tools.ts
          Testirati svaki tool izolovano
Step 7  → src/tools/spektrum.tools.ts
          Test spektrumGenerateTool direktno
Step 8  → src/workflows/vizion-generate.ts
          Testirati agent po agent (1→2→3→4→5)
Step 9  → src/routes/generate.ts
Step 10 → End-to-end generate test (ngrok + Notion button)
Step 11 → src/workflows/vizion-refine.ts
Step 12 → src/routes/refine.ts
Step 13 → End-to-end refine test
Step 14 → Docker deploy na Lightsail
Step 15 → CSP header test (Spektrum app u Notion embed)
Step 16 → Demo video (generate + refine flow)
Step 17 → DEV.to submission
```

---

## Nema bloker-a

Sve je poznato i implementirano u planu:
- **Mozaik** — `MozaikAgent` + `act()` + `Tool` ✅
- **Notion MCP** — wrapped kao Tool, svi metodi ✅
- **Spektrum SDK** — `createProject`, `createTask`, `codeAndDeploy`, `getAppUrl`, `leaveComment` ✅

---

## Submission Framing (za DEV.to post)

**Headline:** *"I built an AI agent that reads your Notion databases and generates a custom dashboard — no configuration, no chart builder, no code"*

**Ključna razlika od svega što postoji:**
> Notion native charts require you to configure each visualization manually.
> vizion uses a Mozaik agent that reads your database schema and data through
> Notion MCP, reasons about what would be most valuable to visualize, and
> generates an arbitrary React app — not limited to 4 chart types.
> With multiple databases on the same page, the agent discovers relationships
> between them and builds cross-database views that no existing tool can produce.

**Demo flow za video:**
1. Notion stranica sa 3 baze (Projects, Team, Tasks)
2. Klikne "📊 Generate Dashboard"
3. Terminal logs — agent skenira, analizira, Spektrum generiše
4. Dashboard se pojavi embedded — prikazuje cross-database insights
5. Korisnik napiše "Add a filter by assignee" ispod embeda
6. Klikne "Refine" — dashboard se ažurira
7. Sve unutar Notiona. Nula konfiguracije.
```
