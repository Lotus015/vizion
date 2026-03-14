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

const RefineResultSchema = z.object({ appUrl: z.url() })

export async function runRefineWorkflow(input: RefineInput): Promise<RefineOutput> {
  const { pageId } = input

  // ── Agent 1: PageReaderAgent ──────────────────────────────────────
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

  // ── Agent 2: SpektrumRefineAgent ──────────────────────────────────
  console.log('[refine:2] refining with Spektrum...')

  const refineAgent = new MozaikAgent({
    model: 'gpt-5-mini',
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

  // ── Agent 3: NotionUpdateAgent ────────────────────────────────────
  console.log('[refine:3] updating embed in Notion...')

  const updateAgent = new MozaikAgent({
    model: 'gpt-5-mini',
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
