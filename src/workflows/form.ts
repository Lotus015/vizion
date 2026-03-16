import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { parseAgentResult } from '../mozaik/helpers'
import { getNotionMcpTools } from '../notion/mcp'
import { getNotionMcpTool } from '../notion/mcp'
import { retrieveDatabaseSchema } from '../notion/api'
import { notifyUser } from '../notion/api'
import { spektrumGenerateTool } from '../spektrum/client'

export interface FormInput {
  pageId: string
  userId: string
  proxyBaseUrl: string
}

export interface FormOutput {
  appUrl: string
  projectId: string
  taskId: string
  formName: string
}

const PageScanSchema = z.object({
  databases: z.array(z.object({ id: z.string(), name: z.string() }))
    .describe('All Notion databases found on this page'),
  pageTitle: z.string(),
})

const FormSpecSchema = z.object({ taskDescription: z.string() })

export async function runFormWorkflow(input: FormInput): Promise<FormOutput> {
  const { pageId, userId, proxyBaseUrl } = input

  const notionTools = await getNotionMcpTools()

  // ── Step 1: Find the target database ────────────────────────────────
  console.log('[form:1] scanning page for databases...')

  const scannerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    tools: notionTools.filter(t => t.name === 'API-get-block-children'),
    structuredOutput: PageScanSchema,
    messages: [{
      role: 'system',
      content: 'You scan Notion pages to find databases. Look for child_database blocks.',
    }],
  })

  const scanRaw = await scannerAgent.act(
    `Scan Notion page ${pageId}. Use API-get-block-children with block_id="${pageId}".
    Find all child_database blocks — return their "id" and "child_database.title".`
  )

  const scanResult = parseAgentResult<z.infer<typeof PageScanSchema>>(scanRaw)
  const allDbs = (scanResult.databases ?? []).filter(db => db.id)

  if (!allDbs.length) {
    throw new Error('No databases found on page.')
  }

  // Use the first database as the form target
  const targetDb = allDbs[0]
  console.log(`[form:1] target database: ${targetDb.name}`)

  // ── Step 2: Get database schema ─────────────────────────────────────
  console.log('[form:2] reading database schema...')

  const schema = await retrieveDatabaseSchema(targetDb.id)
  const editableFields = Object.entries(schema.columns)
    .filter(([_, col]: [string, any]) =>
      ['title', 'rich_text', 'number', 'select', 'multi_select', 'email', 'url', 'phone_number', 'checkbox', 'date'].includes(col.type)
    )
    .map(([name, col]: [string, any]) => {
      let fieldType = col.type
      if (fieldType === 'title' || fieldType === 'rich_text') fieldType = 'text'
      const options = col.options ? ` (options: ${col.options.join(', ')})` : ''
      return `- ${name}: ${fieldType}${options}`
    })
    .join('\n')

  console.log(`[form:2] found ${editableFields.split('\n').length} editable fields`)

  // ── Step 3: Generate form spec ──────────────────────────────────────
  console.log('[form:3] designing form spec...')

  const createUrl = `${proxyBaseUrl}/api/data/create`

  const architectAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    structuredOutput: FormSpecSchema,
    messages: [{
      role: 'system',
      content:
        'You write task descriptions for Spektrum, an AI React app generator. ' +
        'Be specific about data submission patterns. Keep under 2000 characters.',
    }],
  })

  const designRaw = await architectAgent.act(
    `Write a Spektrum task description for a lead capture form / landing page.

    Form name: ${targetDb.name}
    Fields to collect:
    ${editableFields}

    ## How to submit data
    \`\`\`
    const handleSubmit = async (formData) => {
      const res = await fetch("${createUrl}", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          databaseId: "${targetDb.id}",
          properties: formData  // { Name: "...", Email: "...", ... }
        })
      })
      if (res.ok) showSuccess()
    }
    \`\`\`

    Do NOT create local APIs or mock submissions. Always POST to the URL above.

    ## What to build
    - Clean single-page form, like Typeform but simpler
    - One question/field visible at a time, with smooth transition to next
    - Progress indicator at top
    - Validation: required fields, email format, etc.
    - Success screen after submission with confetti or checkmark animation
    - "Powered by vizion" footer link

    ## Style — match Notion's visual identity
    Light clean theme like Notion. Background: #ffffff. Centered card (max-w-lg): white bg, 1px solid #e5e5e5 border, rounded-lg, shadow-sm.
    Typography: system-ui/-apple-system. Headings: #37352f bold. Body: #37352f. Muted: #9b9a97.
    Accent: #2eaadc (Notion blue) for buttons, focus rings, progress bar. Hover: #2496be.
    Input fields: border-bottom 1px #e5e5e5, focus border-bottom #2eaadc. Clean, minimal, no heavy styling.
    Smooth transitions (300ms). Mobile-first, responsive.`
  )

  const design = parseAgentResult<z.infer<typeof FormSpecSchema>>(designRaw)

  if (design.taskDescription.length > 3000) {
    design.taskDescription = design.taskDescription.slice(0, 3000)
  }

  console.log(`[form:3] spec ready (${design.taskDescription.length} chars)`)

  // ── Step 4: Build with Spektrum ─────────────────────────────────────
  console.log('[form:4] generating with Spektrum...')

  const built = await spektrumGenerateTool.invoke({
    owner: userId,
    task_title: `${targetDb.name} Form`,
    task_description: design.taskDescription,
  }) as { appUrl: string; projectId: string; taskId: string }

  console.log(`[form:4] deployed: ${built.appUrl}`)

  // ── Step 5: Embed into Notion ───────────────────────────────────────
  console.log('[form:5] embedding into Notion...')

  const appendBlocks = await getNotionMcpTool('API-patch-block-children')
  await appendBlocks.invoke({
    block_id: pageId,
    children: [
      { type: 'divider', divider: {} },
      {
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: `📝 ${targetDb.name} Form` } }],
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

  await notifyUser(pageId, userId, `Your form "${targetDb.name}" is ready! 📝`)

  console.log('[form] complete:', built.appUrl)
  return {
    appUrl: built.appUrl,
    projectId: built.projectId,
    taskId: built.taskId,
    formName: targetDb.name,
  }
}
