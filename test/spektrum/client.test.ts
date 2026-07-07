// ---------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// ---------------------------------------------------------------------------
const { mockCreateProject, mockCreateTask, mockCodeAndDeploy, mockGetAppUrl, mockLeaveComment } = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockCreateTask: vi.fn(),
  mockCodeAndDeploy: vi.fn(),
  mockGetAppUrl: vi.fn(),
  mockLeaveComment: vi.fn(),
}))

vi.mock('@spektrum-ai/sdk', () => ({
  SpektrumSDK: vi.fn(function () {
    return {
      createProject: mockCreateProject,
      createTask: mockCreateTask,
      codeAndDeploy: mockCodeAndDeploy,
      getAppUrl: mockGetAppUrl,
      leaveComment: mockLeaveComment,
    }
  }),
}))

vi.mock('@mozaik-ai/core', () => ({
  Tool: {},
}))

// ---------------------------------------------------------------------------
// Imports under test (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import {
  spektrumGenerateTool,
  spektrumRefineTool,
} from '../../src/spektrum/client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const POLL_INTERVAL_MS = 15_000
const DEPLOY_TIMEOUT_MS = 10 * 60 * 1_000

// ---------------------------------------------------------------------------
// spektrumGenerateTool — happy path
// ---------------------------------------------------------------------------
describe('spektrumGenerateTool.invoke()', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  it('creates project, task, deploys and returns {appUrl, projectId, taskId}', async () => {
    mockCreateProject.mockResolvedValue({ project: { id: 'proj-abc-123' } })
    mockCreateTask.mockResolvedValue({ id: 'task-xyz-789' })
    mockCodeAndDeploy.mockResolvedValue(undefined)
    mockGetAppUrl.mockResolvedValue('https://app.spektrum.dev/my-dashboard')

    const result = await spektrumGenerateTool.invoke({
      owner: 'test-owner',
      task_title: 'My Dashboard',
      task_description: 'A test dashboard',
    })

    expect(mockCreateProject).toHaveBeenCalledWith('test-owner')
    expect(mockCreateTask).toHaveBeenCalledWith(
      'proj-abc-123',
      'My Dashboard',
      'A test dashboard',
    )
    expect(mockCodeAndDeploy).toHaveBeenCalledTimes(1)
    expect(mockGetAppUrl).toHaveBeenCalledWith('proj-abc-123')
    expect(result).toEqual({
      appUrl: 'https://app.spektrum.dev/my-dashboard',
      projectId: 'proj-abc-123',
      taskId: 'task-xyz-789',
    })
  })
})

// ---------------------------------------------------------------------------
// codeAndDeployWithRetry — error / retry scenarios (via spektrumGenerateTool)
// ---------------------------------------------------------------------------
describe('codeAndDeployWithRetry (via spektrumGenerateTool.invoke)', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  // Happy path already tested above; these tests inject errors into codeAndDeploy

  it('re-throws when codeAndDeploy fails with a non-timeout error', async () => {
    mockCreateProject.mockResolvedValue({ project: { id: 'proj-err' } })
    mockCreateTask.mockResolvedValue({ id: 'task-err' })
    mockCodeAndDeploy.mockRejectedValue(new Error('Some unrelated error'))

    await expect(
      spektrumGenerateTool.invoke({
        owner: 'owner',
        task_title: 'T',
        task_description: 'D',
      }),
    ).rejects.toThrow('Some unrelated error')
  })

  it('polls getAppUrl when codeAndDeploy fails with "fetch failed", eventually returns URL', async () => {
    vi.useFakeTimers()

    mockCreateProject.mockResolvedValue({ project: { id: 'proj-retry' } })
    mockCreateTask.mockResolvedValue({ id: 'task-retry' })
    mockCodeAndDeploy.mockRejectedValue(new Error('fetch failed'))
    // First poll returns null (not ready), second returns the URL
    mockGetAppUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://app.spektrum.dev/retry-dashboard')

    const invokePromise = spektrumGenerateTool.invoke({
      owner: 'owner',
      task_title: 'T',
      task_description: 'D',
    })

    // Advance through first poll cycle (getAppUrl returns null, loop continues)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    // Advance through second poll cycle (getAppUrl returns URL, exits)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    const result = await invokePromise
    expect(result).toEqual({
      appUrl: 'https://app.spektrum.dev/retry-dashboard',
      projectId: 'proj-retry',
      taskId: 'task-retry',
    })
  })

  it('polls when codeAndDeploy fails with "timeout", eventually returns URL', async () => {
    vi.useFakeTimers()

    mockCreateProject.mockResolvedValue({ project: { id: 'proj-timeout-retry' } })
    mockCreateTask.mockResolvedValue({ id: 'task-timeout-retry' })
    mockCodeAndDeploy.mockRejectedValue(new Error('timeout'))
    // First poll returns null, second returns URL
    mockGetAppUrl
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce('https://app.spektrum.dev/timeout-retry')

    const invokePromise = spektrumGenerateTool.invoke({
      owner: 'owner',
      task_title: 'T',
      task_description: 'D',
    })

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    const result = await invokePromise
    expect(result).toEqual({
      appUrl: 'https://app.spektrum.dev/timeout-retry',
      projectId: 'proj-timeout-retry',
      taskId: 'task-timeout-retry',
    })
  })

  it('throws "Deploy timed out" when getAppUrl never returns a URL within the timeout', async () => {
    vi.useFakeTimers()

    mockCreateProject.mockResolvedValue({ project: { id: 'proj-timeout' } })
    mockCreateTask.mockResolvedValue({ id: 'task-timeout' })
    mockCodeAndDeploy.mockRejectedValue(new Error('fetch failed'))
    mockGetAppUrl.mockResolvedValue(null) // never ready

    const invokePromise = spektrumGenerateTool.invoke({
      owner: 'owner',
      task_title: 'T',
      task_description: 'D',
    })

    // Attach handler BEFORE advancing timers to avoid unhandled rejection
    const caught = invokePromise.catch((e: unknown) => e)

    // Advance past the full deploy timeout
    await vi.advanceTimersByTimeAsync(DEPLOY_TIMEOUT_MS)

    const error = await caught
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('Deploy timed out after 600s')
  })

  it('getAppUrl throwing is swallowed and polling continues', async () => {
    vi.useFakeTimers()

    mockCreateProject.mockResolvedValue({ project: { id: 'proj-swallow' } })
    mockCreateTask.mockResolvedValue({ id: 'task-swallow' })
    mockCodeAndDeploy.mockRejectedValue(new Error('fetch failed'))
    // First call throws, second returns URL
    mockGetAppUrl
      .mockRejectedValueOnce(new Error('not ready'))
      .mockResolvedValueOnce('https://app.spektrum.dev/swallowed')

    const invokePromise = spektrumGenerateTool.invoke({
      owner: 'owner',
      task_title: 'T',
      task_description: 'D',
    })

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS)

    const result = await invokePromise
    expect(result.appUrl).toBe('https://app.spektrum.dev/swallowed')
  })
})

// ---------------------------------------------------------------------------
// spektrumRefineTool — happy path
// ---------------------------------------------------------------------------
describe('spektrumRefineTool.invoke()', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('calls leaveComment with default author_id and returns {appUrl}', async () => {
    mockLeaveComment.mockResolvedValue({ id: 'task-refine' })
    mockCodeAndDeploy.mockResolvedValue(undefined)
    mockGetAppUrl.mockResolvedValue('https://app.spektrum.dev/refined')

    const result = await spektrumRefineTool.invoke({
      project_id: 'proj-ref',
      task_id: 'task-refine',
      comment: 'Please refine the colors',
    })

    expect(mockLeaveComment).toHaveBeenCalledWith(
      'task-refine',
      'Please refine the colors',
      'vizion-user',
    )
    expect(result).toEqual({ appUrl: 'https://app.spektrum.dev/refined' })
  })

  it('passes explicit author_id to leaveComment', async () => {
    mockLeaveComment.mockResolvedValue({ id: 'task-refine-2' })
    mockCodeAndDeploy.mockResolvedValue(undefined)
    mockGetAppUrl.mockResolvedValue('https://app.spektrum.dev/refined-2')

    await spektrumRefineTool.invoke({
      project_id: 'proj-ref-2',
      task_id: 'task-refine-2',
      comment: 'Another refinement',
      author_id: 'custom-author',
    })

    expect(mockLeaveComment).toHaveBeenCalledWith(
      'task-refine-2',
      'Another refinement',
      'custom-author',
    )
  })
})
