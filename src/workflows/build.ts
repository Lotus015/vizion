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

    const createExamples = createdDbs.map(db => {
      const props = db.columns
        .filter(c => c.type !== 'title')
        .map(c => `"${c.name}": value`)
        .join(', ')
      const titleCol = db.columns.find(c => c.type === 'title')
      const titleProp = titleCol ? `"${titleCol.name}": title, ` : ''
      return `// Create row in "${db.name}":
await fetch("${createUrl}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ databaseId: "${db.databaseId}", properties: { ${titleProp}${props} } })
})`
    }).join('\n')

    dataIntegrationNotes = `## Data integration — MANDATORY (use these EXACT URLs, do NOT invent endpoints)

### READ data — copy this exactly
\`\`\`
const DATA_URL = "${readUrl}"
const [data, setData] = useState(null)
useEffect(() => {
  const load = () => fetch(DATA_URL).then(r => r.json()).then(setData)
  load()
  const id = setInterval(load, 10000)
  return () => clearInterval(id)
}, [])
${cleanNames.map(n => `const ${n} = data?.${n} ?? []`).join('\n')}
\`\`\`

### WRITE data — copy this exactly
\`\`\`
${createExamples}
\`\`\`
After successful write, call load() again to refresh. Show success feedback.
Do NOT use mock data, dummy APIs, localStorage, or placeholder URLs.`
  } else {
    console.log('[build:3] no databases needed, skipping')
  }

  // ── Step 4: Build with Spektrum ─────────────────────────────────────
  console.log('[build:4] generating with Spektrum...')

  // Data integration goes FIRST so it never gets truncated
  const styleBlock = `## MANDATORY STYLE — Notion Light Theme (NO dark mode)
bg #ffffff ONLY. Cards: bg white, border 1px solid #e5e5e5, rounded-lg, shadow-sm.
Font: system-ui. Headings: #37352f bold. Body: #37352f. Muted: #9b9a97.
Accent: #2eaadc. Buttons: bg #2eaadc text white. Charts: #2eaadc #6940a5 #4dab9a #e9b949 #e16259.
NO dark backgrounds, NO gradients, NO dark themes. Must look like Notion.`

  // Budget: data ~800 chars, style ~350 chars, tech ~100 chars = ~1250 reserved
  const reservedLen = dataIntegrationNotes.length + styleBlock.length + 150
  const maxContentLen = 3000 - reservedLen
  const trimmedContent = page.content.length > maxContentLen
    ? page.content.slice(0, maxContentLen) + '\n[...truncated]'
    : page.content

  const taskDescription = `${dataIntegrationNotes}

## App description
${trimmedContent}

## Technical notes
React, Tailwind CSS, Recharts (if charts needed). Mobile-responsive.

${styleBlock}`

  console.log(`[build:4] task description: ${taskDescription.length} chars (content: ${trimmedContent.length}, data: ${dataIntegrationNotes.length})`)

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
