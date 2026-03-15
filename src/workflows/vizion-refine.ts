import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { PAGE_SCAN_TOOLS, notionUpdateEmbedTool } from '../tools/notion-mcp.tools'
import { spektrumRefineTool } from '../tools/spektrum.tools'

export interface RefineInput {
  pageId: string
}

export interface RefineOutput {
  appUrl: string
}

/** Mozaik act() returns { data, usage } — extract the data payload */
function parseAgentResult<T>(raw: unknown): T {
  const obj = raw as any
  if (obj?.data != null) {
    return typeof obj.data === 'string' ? JSON.parse(obj.data) as T : obj.data as T
  }
  return obj as T
}

const MetadataSchema = z.object({
  projectId: z.string(),
  taskId: z.string(),
  userComment: z.string().describe('The refinement request written by the user'),
})

export async function runRefineWorkflow(input: RefineInput): Promise<RefineOutput> {
  const { pageId } = input

  // ── Agent 1: Read page for metadata and user comment ────────────────
  console.log('[refine:1] reading page for metadata and user comment...')

  const readerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
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

  const metaRaw = await readerAgent.act(
    `Read the Notion page: ${pageId}

    Use notion_get_page_content to retrieve all blocks.

    Find:
    1. The callout block containing "vizion:..." — extract projectId and taskId
       (format: vizion:PROJECT_ID:TASK_ID)
    2. Any paragraph text after the embed block — this is the user's refinement request

    Return projectId, taskId, and userComment.`
  )

  const meta = parseAgentResult<z.infer<typeof MetadataSchema>>(metaRaw)
  console.log(`[refine:1] project=${meta.projectId}, comment="${meta.userComment}"`)

  // ── Step 2: Spektrum refine (direct call) ────────────────────────────
  console.log('[refine:2] refining with Spektrum...')

  const refined = await spektrumRefineTool.invoke({
    project_id: meta.projectId,
    task_id: meta.taskId,
    comment: meta.userComment,
    author_id: pageId,
  }) as { appUrl: string }

  console.log(`[refine:2] new app: ${refined.appUrl}`)

  // ── Step 3: Update Notion embed (direct call) ───────────────────────
  console.log('[refine:3] updating embed in Notion...')

  await notionUpdateEmbedTool.invoke({
    page_id: pageId,
    new_app_url: refined.appUrl,
  })

  console.log('[refine] complete:', refined.appUrl)
  return { appUrl: refined.appUrl }
}
