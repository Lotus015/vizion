import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Shared mock instance — we control methods per test
const mockSpektrumInstance = {
  createProject: vi.fn(),
  createTask: vi.fn(),
  codeAndDeploy: vi.fn(),
  getAppUrl: vi.fn(),
  leaveComment: vi.fn(),
}

vi.mock('@spektrum-ai/sdk', () => ({
  SpektrumSDK: vi.fn(() => mockSpektrumInstance),
}))

// We'll dynamically import the module in each test to avoid stale references
async function importClient() {
  return await import('./client')
}

describe('spektrum/client', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('spektrumGenerateTool', () => {
    it('should create project, task, deploy, and return appUrl/projectId/taskId (happy path)', async () => {
      mockSpektrumInstance.createProject.mockResolvedValue({ project: { id: 'proj-1' } })
      mockSpektrumInstance.createTask.mockResolvedValue({ id: 'task-1' })
      mockSpektrumInstance.codeAndDeploy.mockResolvedValue(undefined)
      mockSpektrumInstance.getAppUrl.mockResolvedValue('https://app.example.com')

      const { spektrumGenerateTool } = await importClient()
      const result = await spektrumGenerateTool.invoke({
        owner: 'user-1',
        task_title: 'My Dashboard',
        task_description: 'A test dashboard',
      })

      expect(result).toEqual({
        appUrl: 'https://app.example.com',
        projectId: 'proj-1',
        taskId: 'task-1',
      })

      expect(mockSpektrumInstance.createProject).toHaveBeenCalledWith('user-1')
      expect(mockSpektrumInstance.createTask).toHaveBeenCalledWith('proj-1', 'My Dashboard', 'A test dashboard')
      expect(mockSpektrumInstance.codeAndDeploy).toHaveBeenCalledWith({ id: 'task-1' })
      expect(mockSpektrumInstance.getAppUrl).toHaveBeenCalledWith('proj-1')
    })

    it('should retry on "fetch failed" error and poll until deploy completes', async () => {
      mockSpektrumInstance.createProject.mockResolvedValue({ project: { id: 'proj-2' } })
      mockSpektrumInstance.createTask.mockResolvedValue({ id: 'task-2' })
      mockSpektrumInstance.codeAndDeploy.mockRejectedValue(new Error('fetch failed'))

      // First 2 polls return empty, third returns URL
      mockSpektrumInstance.getAppUrl
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('https://app.example.com')

      const { spektrumGenerateTool } = await importClient()
      const invokePromise = spektrumGenerateTool.invoke({
        owner: 'user-1',
        task_title: 'Test',
        task_description: 'Desc',
      })

      // Advance past first poll (15s)
      await vi.advanceTimersByTimeAsync(15000)
      // Advance past second poll (another 15s)
      await vi.advanceTimersByTimeAsync(15000)
      // Advance past third poll (another 15s) — this one should succeed
      await vi.advanceTimersByTimeAsync(15000)

      const result = await invokePromise
      expect(result.appUrl).toBe('https://app.example.com')
      expect(mockSpektrumInstance.getAppUrl).toHaveBeenCalledTimes(3)
    })

    it('should retry on "timeout" substring error and recover', async () => {
      mockSpektrumInstance.createProject.mockResolvedValue({ project: { id: 'proj-3' } })
      mockSpektrumInstance.createTask.mockResolvedValue({ id: 'task-3' })
      mockSpektrumInstance.codeAndDeploy.mockRejectedValue(new Error('timeout occurred'))
      mockSpektrumInstance.getAppUrl
        .mockResolvedValueOnce('')
        .mockResolvedValueOnce('https://app.example.com')

      const { spektrumGenerateTool } = await importClient()
      const invokePromise = spektrumGenerateTool.invoke({
        owner: 'user-1',
        task_title: 'Test',
        task_description: 'Desc',
      })

      await vi.advanceTimersByTimeAsync(15000)
      await vi.advanceTimersByTimeAsync(15000)

      const result = await invokePromise
      expect(result.appUrl).toBe('https://app.example.com')
    })

    it('should reject non-retry errors immediately without polling', async () => {
      mockSpektrumInstance.createProject.mockResolvedValue({ project: { id: 'proj-4' } })
      mockSpektrumInstance.createTask.mockResolvedValue({ id: 'task-4' })
      mockSpektrumInstance.codeAndDeploy.mockRejectedValue(new Error('boom'))

      const { spektrumGenerateTool } = await importClient()
      const invokePromise = spektrumGenerateTool.invoke({
        owner: 'user-1',
        task_title: 'Test',
        task_description: 'Desc',
      })

      await expect(invokePromise).rejects.toThrow('boom')
      // getAppUrl should never be called
      expect(mockSpektrumInstance.getAppUrl).not.toHaveBeenCalled()
    })

    it('should reject with deploy timeout after 10 minutes of polling', async () => {
      mockSpektrumInstance.createProject.mockResolvedValue({ project: { id: 'proj-5' } })
      mockSpektrumInstance.createTask.mockResolvedValue({ id: 'task-5' })
      mockSpektrumInstance.codeAndDeploy.mockRejectedValue(new Error('fetch failed'))
      mockSpektrumInstance.getAppUrl.mockResolvedValue('') // never resolves

      // Spy on console.log to keep output clean
      vi.spyOn(console, 'log').mockImplementation(() => {})

      const { spektrumGenerateTool } = await importClient()
      // Chain .catch() immediately to prevent unhandled rejection
      let caught: any = null
      const invokePromise = spektrumGenerateTool.invoke({
        owner: 'user-1',
        task_title: 'Test',
        task_description: 'Desc',
      }).catch(e => { caught = e })

      // Advance by 600s (10 min) — fake-timers processes all intermediate timers
      await vi.advanceTimersByTimeAsync(600_000)

      // Allow the rejection to propagate
      await vi.waitFor(() => {
        if (!caught) throw new Error('Expected rejection')
      })
      expect(caught.message).toContain('Deploy timed out after 600s')
    })
  })

  describe('spektrumRefineTool', () => {
    it('should leave comment, deploy, and return appUrl (happy path)', async () => {
      mockSpektrumInstance.leaveComment.mockResolvedValue({ id: 'task-r1' })
      mockSpektrumInstance.codeAndDeploy.mockResolvedValue(undefined)
      mockSpektrumInstance.getAppUrl.mockResolvedValue('https://app.example.com')

      const { spektrumRefineTool } = await importClient()
      const result = await spektrumRefineTool.invoke({
        project_id: 'proj-r1',
        task_id: 'task-r1',
        comment: 'Make it blue',
      })

      expect(result).toEqual({ appUrl: 'https://app.example.com' })
      expect(mockSpektrumInstance.leaveComment).toHaveBeenCalledWith('task-r1', 'Make it blue', 'vizion-user')
      expect(mockSpektrumInstance.codeAndDeploy).toHaveBeenCalledWith({ id: 'task-r1' })
    })

    it('should use provided author_id when given', async () => {
      mockSpektrumInstance.leaveComment.mockResolvedValue({ id: 'task-r2' })
      mockSpektrumInstance.codeAndDeploy.mockResolvedValue(undefined)
      mockSpektrumInstance.getAppUrl.mockResolvedValue('https://app.example.com')

      const { spektrumRefineTool } = await importClient()
      await spektrumRefineTool.invoke({
        project_id: 'proj-r2',
        task_id: 'task-r2',
        comment: 'Nice',
        author_id: 'custom-author',
      })

      expect(mockSpektrumInstance.leaveComment).toHaveBeenCalledWith('task-r2', 'Nice', 'custom-author')
    })
  })
})
