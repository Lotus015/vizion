import { z } from 'zod'
import { MozaikAgent } from '@mozaik-ai/core'
import { getNotionMcpTools } from '../lib/notion-mcp'
import { updateEmbed } from '../lib/notion-api'
import { spektrumRefineTool } from '../tools/spektrum.tools'
import { getDashboard } from '../lib/dashboard-registry'
import { notifyUser } from '../lib/notion-api'

export interface RefineInput {
  pageId: string
  userId?: string
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

const CommentSchema = z.object({
  userComment: z.string().describe('The refinement request written by the user'),
})

export async function runRefineWorkflow(input: RefineInput): Promise<RefineOutput> {
  const { pageId, userId } = input

  // ── Look up metadata from registry ──────────────────────────────────
  const dashboard = getDashboard(pageId)
  if (!dashboard) {
    throw new Error(`No dashboard registered for page ${pageId}. Was it generated in this session?`)
  }

  const { projectId, taskId } = dashboard

  // ── Agent 1: Read page for user comment (via MCP) ───────────────────
  console.log('[refine:1] reading page for user comment...')

  const notionTools = await getNotionMcpTools()

  const readerAgent = new MozaikAgent({
    model: 'gpt-5-mini',
    tools: notionTools.filter(t => t.name === 'retrieve-block-children'),
    structuredOutput: CommentSchema,
    messages: [{
      role: 'system',
      content:
        'You read Notion pages to find user refinement requests. ' +
        'The user writes their feedback as text after the dashboard embed block.',
    }],
  })

  const commentRaw = await readerAgent.act(
    `Read the Notion page: ${pageId}

    Use the retrieve-block-children tool with block_id="${pageId}" to get all blocks.

    Find any paragraph text after the embed block — this is the user's refinement request.
    Return it as userComment.`
  )

  const { userComment } = parseAgentResult<z.infer<typeof CommentSchema>>(commentRaw)
  console.log(`[refine:1] project=${projectId}, comment="${userComment}"`)

  // ── Step 2: Spektrum refine (direct call) ────────────────────────────
  console.log('[refine:2] refining with Spektrum...')

  const refined = await spektrumRefineTool.invoke({
    project_id: projectId,
    task_id: taskId,
    comment: userComment,
    author_id: pageId,
  }) as { appUrl: string }

  console.log(`[refine:2] new app: ${refined.appUrl}`)

  // ── Step 3: Update Notion embed (direct API — MCP has no update block)
  console.log('[refine:3] updating embed in Notion...')

  await updateEmbed(pageId, refined.appUrl)

  // Notify user
  if (userId) {
    await notifyUser(pageId, userId, 'Your dashboard has been refined! ✨')
  }

  console.log('[refine] complete:', refined.appUrl)
  return { appUrl: refined.appUrl }
}
