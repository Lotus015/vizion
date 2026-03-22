import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { parseAgentResult } from '../mozaik/helpers'
import { getNotionMcpTools, getNotionMcpTool } from '../notion/mcp'
import { notifyUser, createNotionDatabase } from '../notion/api'
import { spektrumGenerateTool } from '../spektrum/client'

export interface BuildInput {
  pageId: string
  userId: string
  proxyBaseUrl: string
}

export interface BuildOutput {
  appUrl: string
  projectId: string
  taskId: string
}

const PageContentSchema = z.object({
  title: z.string(),
  content: z.string().describe('All text content from the page, concatenated'),
})

const DatabasePlanSchema = z.object({
  needsDatabases: z.boolean().describe('Whether this app needs Notion databases for data storage'),
  databases: z.array(z.object({
    name: z.string().describe('Database name, e.g. "Leads", "Submissions"'),
    columns: z.array(z.object({
      name: z.string(),
      type: z.enum(['title', 'rich_text', 'number', 'select', 'multi_select', 'email', 'url', 'phone_number', 'checkbox', 'date', 'status']),
      options: z.array(z.string()).nullable().describe('Options for select/multi_select/status fields, null if not applicable'),
    })),
  })).describe('Databases to create. Empty array if needsDatabases is false.'),
})

export async function runBuildWorkflow(input: BuildInput): Promise<BuildOutput> {
  const { pageId, userId, proxyBaseUrl } = input

  const notionTools = await getNotionMcpTools()

  // ── Step 1: Read page content ───────────────────────────────────────
  console.log('[build:1] reading page content...')

  const readerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    tools: notionTools.filter(t => t.name === 'API-get-block-children'),
    structuredOutput: PageContentSchema,
    messages: [{
      role: 'system',
      content:
        'You read Notion pages and extract all text content. ' +
        'Concatenate all paragraph, heading, bulleted list, numbered list, to-do, ' +
        'and callout text into a single string. Preserve structure with newlines. ' +
        'Ignore embed blocks, dividers, and metadata.',
    }],
  })

  const readRaw = await readerAgent.act(
    `Read the Notion page ${pageId}. Use API-get-block-children with block_id="${pageId}".
    Extract the page title and all text content from the blocks.
    Return the title and concatenated content.`
  )

  const page = parseAgentResult<z.infer<typeof PageContentSchema>>(readRaw)
  console.log(`[build:1] "${page.title}" — ${page.content.length} chars`)

  if (!page.content.trim()) {
    throw new Error('Page has no text content. Write a description of what you want to build.')
  }

  // ── Step 2: Plan databases ──────────────────────────────────────────
  console.log('[build:2] analyzing if databases are needed...')

  const plannerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    structuredOutput: DatabasePlanSchema,
    messages: [{
      role: 'system',
      content:
        'You analyze app descriptions and determine what Notion databases are needed. ' +
        'For landing pages with email capture → create a Leads database. ' +
        'For forms/surveys → create a Submissions database. ' +
        'For trackers/boards → create appropriate databases. ' +
        'For static pages, games, or tools that don\'t collect data → no databases needed. ' +
        'Always include a "title" type column as the first column.',
    }],
  })

  const planRaw = await plannerAgent.act(
    `Analyze this app description and determine what Notion databases are needed:

    Title: ${page.title}
    Description: ${page.content}

    If the app collects any user data (emails, form submissions, signups, feedback, etc.),
    plan the databases with appropriate columns. Otherwise set needsDatabases to false.`
  )

  const plan = parseAgentResult<z.infer<typeof DatabasePlanSchema>>(planRaw)

  // ── Step 3: Create databases if needed ──────────────────────────────
  let dataIntegrationNotes = ''

  if (plan.needsDatabases && plan.databases.length > 0) {
    console.log(`[build:3] creating ${plan.databases.length} database(s)...`)

    const createdDbs: Array<{ name: string; databaseId: string; columns: Array<{ name: string; type: string }> }> = []

    for (const db of plan.databases) {
      const result = await createNotionDatabase(pageId, db.name, db.columns.map(c => ({ ...c, options: c.options ?? undefined })))
      createdDbs.push({ name: db.name, ...result })
      console.log(`[build:3] created "${db.name}" → ${result.databaseId}`)
    }

    // Build integration instructions for Spektrum
    const dbIds = createdDbs.map(db => `databaseId=${db.databaseId}`).join('&')
    const readUrl = `${proxyBaseUrl}/api/data?${dbIds}`
    const createUrl = `${proxyBaseUrl}/api/data/create`

    const dbSchemas = createdDbs.map(db => {
      const cols = db.columns.map(c => `${c.name} (${c.type})`).join(', ')
      return `- "${db.name}" (ID: ${db.databaseId}): ${cols}`
    }).join('\n')

    const cleanNames = createdDbs.map(db =>
      db.name.replace(/\.csv$/i, '').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()
    )

    dataIntegrationNotes = `
## Data integration — MANDATORY (use these EXACT URLs, do NOT invent your own)

Databases:
${dbSchemas}

### Reading data — use this EXACT code
\`\`\`
const DATA_URL = "${readUrl}"
const [data, setData] = useState(null)
useEffect(() => {
  const load = () => fetch(DATA_URL).then(r => r.json()).then(setData)
  load()
  const id = setInterval(load, 10000)
  return () => clearInterval(id)
}, [])
// Access rows:
${cleanNames.map(n => `const ${n} = data?.${n} ?? []`).join('\n')}
\`\`\`

### Creating rows — use this EXACT code
\`\`\`
await fetch("${createUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    databaseId: "<DATABASE_ID>",
    properties: { "FieldName": value, ... }
  })
})
\`\`\`

CRITICAL: Do NOT create mock data, dummy APIs, local JSON, or placeholder URLs.
The DATA_URL above returns real live data. Use it exactly as shown.
On successful submission, show a success message and refresh data.`
  } else {
    console.log('[build:3] no databases needed, skipping')
  }

  // ── Step 4: Build with Spektrum ─────────────────────────────────────
  console.log('[build:4] generating with Spektrum...')

  const taskDescription = `${page.content}
${dataIntegrationNotes}

## Technical notes
- Use React, Tailwind CSS, Recharts (if charts needed)
- Mobile-responsive

## MANDATORY STYLE — Notion Light Theme (DO NOT use dark mode, dark backgrounds, or dark themes)
Background: #ffffff ONLY. No dark mode. No gray/black backgrounds. No gradients.
Cards/containers: background #ffffff, border 1px solid #e5e5e5, border-radius 8px, shadow-sm.
Typography: font-family system-ui, -apple-system, sans-serif.
  - Headings: color #37352f, font-weight bold
  - Body text: color #37352f
  - Muted/labels: color #9b9a97, text-sm, uppercase tracking-wide
Accent color: #2eaadc (Notion blue). Buttons: bg #2eaadc, text white, rounded, hover #2496be.
Chart palette: #2eaadc (blue), #6940a5 (purple), #4dab9a (green), #e9b949 (yellow), #e16259 (red).
KPI numbers: text-3xl font-bold #37352f. Layout: responsive grid, padding p-6, gap gap-4.
This is a HARD REQUIREMENT. The app MUST look like it belongs inside Notion.`

  const built = await spektrumGenerateTool.invoke({
    owner: userId,
    task_title: page.title,
    task_description: taskDescription.slice(0, 3000),
  }) as { appUrl: string; projectId: string; taskId: string }

  console.log(`[build:4] deployed: ${built.appUrl}`)

  // ── Step 5: Embed into Notion ───────────────────────────────────────
  console.log('[build:5] embedding into Notion...')

  const appendBlocks = await getNotionMcpTool('API-patch-block-children')
  await appendBlocks.invoke({
    block_id: pageId,
    children: [
      { type: 'divider', divider: {} },
      {
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: `🚀 ${page.title}` } }],
        },
      },
      { type: 'embed', embed: { url: built.appUrl } },
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

  await notifyUser(pageId, userId, `Your app "${page.title}" is ready! 🚀`)

  console.log('[build] complete:', built.appUrl)
  return {
    appUrl: built.appUrl,
    projectId: built.projectId,
    taskId: built.taskId,
  }
}
