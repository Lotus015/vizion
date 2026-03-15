import { Tool } from '@mozaik-ai/core'
import { SpektrumSDK, type Task } from '@spektrum-ai/sdk'

const spektrum = new SpektrumSDK()

const DEPLOY_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes
const POLL_INTERVAL_MS = 15_000 // 15 seconds

/**
 * codeAndDeploy can take 5-6 minutes. Node fetch may timeout before
 * Spektrum finishes. This wrapper catches the timeout and polls
 * getAppUrl until the deploy completes.
 */
async function codeAndDeployWithRetry(task: Task, projectId: string): Promise<string> {
  try {
    await spektrum.codeAndDeploy(task)
    return await spektrum.getAppUrl(projectId)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : ''
    if (message.includes('fetch failed') || message.includes('timeout')) {
      console.log('[spektrum] request timed out, polling for completion...')
      return pollForAppUrl(projectId)
    }
    throw err
  }
}

async function pollForAppUrl(projectId: string): Promise<string> {
  const start = Date.now()

  while (Date.now() - start < DEPLOY_TIMEOUT_MS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS))

    try {
      const appUrl = await spektrum.getAppUrl(projectId)
      if (appUrl) {
        console.log(`[spektrum] deploy complete (${Math.round((Date.now() - start) / 1000)}s)`)
        return appUrl
      }
    } catch {
      // not ready yet
    }

    console.log(`[spektrum] waiting... (${Math.round((Date.now() - start) / 1000)}s)`)
  }

  throw new Error(`Deploy timed out after ${DEPLOY_TIMEOUT_MS / 1000}s`)
}

// ── Generate: create project, task, deploy ────────────────────────────
export const spektrumGenerateTool: Tool = {
  name: 'spektrum_generate',
  description: 'Creates a Spektrum project, generates and deploys a React app.',
  schema: {
    type: 'object',
    properties: {
      owner: { type: 'string', description: 'Owner identifier' },
      task_title: { type: 'string', description: 'Short title' },
      task_description: { type: 'string', description: 'Dashboard specification' },
    },
    required: ['owner', 'task_title', 'task_description'],
  },
  async invoke({ owner, task_title, task_description }: { owner: string; task_title: string; task_description: string }) {
    const createResult = await spektrum.createProject(owner)
    // SDK types are incorrect — actual response wraps in { project: { id, ... } }
    const projectId = (createResult as unknown as { project: { id: string } }).project.id
    console.log('[spektrum] project:', projectId)

    const task = await spektrum.createTask(projectId, task_title, task_description)
    console.log('[spektrum] task:', task.id)

    console.log('[spektrum] deploying (may take several minutes)...')
    const appUrl = await codeAndDeployWithRetry(task, projectId)

    return { appUrl, projectId, taskId: task.id }
  },
}

// ── Refine: comment on task, redeploy ─────────────────────────────────
export const spektrumRefineTool: Tool = {
  name: 'spektrum_refine',
  description: 'Leaves a comment on a Spektrum task and re-deploys.',
  schema: {
    type: 'object',
    properties: {
      project_id: { type: 'string' },
      task_id: { type: 'string' },
      comment: { type: 'string', description: 'User feedback' },
      author_id: { type: 'string', description: 'Author identifier' },
    },
    required: ['project_id', 'task_id', 'comment'],
  },
  async invoke({ project_id, task_id, comment, author_id = 'vizion-user' }: { project_id: string; task_id: string; comment: string; author_id?: string }) {
    const task = await spektrum.leaveComment(task_id, comment, author_id)

    console.log('[spektrum] deploying refinement...')
    const appUrl = await codeAndDeployWithRetry(task, project_id)

    return { appUrl }
  },
}
