import { Tool } from '@mozaik-ai/core'
import { SpektrumSDK } from '@spektrum-ai/sdk'

const spektrum = new SpektrumSDK()

// ── Tool 1: Generate (new project) ───────────────────────────────────
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
  async invoke({ project_name, task_title, task_description }: any) {
    const project = await spektrum.createProject(project_name)
    const task = await spektrum.createTask(project.id, task_title, task_description)
    await spektrum.codeAndDeploy(task)
    const appUrl = await spektrum.getAppUrl(project.id)
    return { appUrl, projectId: project.id, taskId: task.id }
  },
}

// ── Tool 2: Refine (iterate on existing) ─────────────────────────────
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
  async invoke({ project_id, task_id, comment, author_id = 'vizion-user' }: any) {
    const updatedTask = await spektrum.leaveComment(task_id, comment, author_id)
    await spektrum.codeAndDeploy(updatedTask)
    const appUrl = await spektrum.getAppUrl(project_id)
    return { appUrl }
  },
}
