// ---------------------------------------------------------------------------
// Hoisted mocks — run before any imports
// ---------------------------------------------------------------------------
const { mockClient, MockClient, mockNormalizeRows, mockDenormalizeProperties } = vi.hoisted(() => {
  const client = {
    databases: {
      retrieve: vi.fn(),
      query: vi.fn(),
      create: vi.fn(),
    },
    pages: {
      create: vi.fn(),
      update: vi.fn(),
    },
    comments: {
      create: vi.fn(),
    },
    blocks: {
      children: { list: vi.fn() },
      update: vi.fn(),
    },
  }

  return {
    mockClient: client,
    MockClient: vi.fn(function () { return client }),
    mockNormalizeRows: vi.fn(function (pages: any[]) {
      return pages.map((p: any) => ({ id: p.id, ...p.properties }))
    }),
    mockDenormalizeProperties: vi.fn(function (
      flat: Record<string, any>,
      _schema: Record<string, { type: string }>,
    ) {
      return flat
    }),
  }
})

vi.mock('@notionhq/client', () => ({
  Client: MockClient,
}))

vi.mock('../../src/notion/normalize', () => ({
  normalizeRows: mockNormalizeRows,
}))

vi.mock('../../src/notion/denormalize', () => ({
  denormalizeProperties: mockDenormalizeProperties,
}))

// ---------------------------------------------------------------------------
// Imports under test (must come after vi.mock calls)
// ---------------------------------------------------------------------------
import { Client } from '@notionhq/client'

import {
  cleanId,
  notion,
  notifyUser,
  retrieveDatabaseSchema,
  queryDatabase,
  updateDatabaseRow,
  createDatabaseRow,
  createNotionDatabase,
  updateEmbed,
} from '../../src/notion/api'

import { normalizeRows } from '../../src/notion/normalize'
import { denormalizeProperties } from '../../src/notion/denormalize'

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeAll(() => {
  process.env.NOTION_API_KEY = 'test-secret-key'
})

afterEach(() => {
  vi.clearAllMocks()
})

// ── notion() ────────────────────────────────────────────────────────────────
describe('notion()', () => {
  it('creates a Client with the env auth key', () => {
    const instance = notion()
    expect(Client).toHaveBeenCalledWith({ auth: 'test-secret-key' })
    expect(instance).toBe(mockClient)
  })

  it('creates a new Client each call', () => {
    notion()
    notion()
    expect(Client).toHaveBeenCalledTimes(2)
  })
})

// ── cleanId() ───────────────────────────────────────────────────────────────
describe('cleanId()', () => {
  it('reformats a 32-hex string with extraneous dashes', () => {
    const input = 'abc1-def2-3456-7890-abcd-ef12-3456-7890'
    const expected = 'abc1def2-3456-7890-abcd-ef1234567890'
    expect(cleanId(input)).toBe(expected)
  })

  it('reformats a 32-hex string without dashes into 8-4-4-4-12 form', () => {
    const input = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
    const expected = 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6'
    expect(cleanId(input)).toBe(expected)
  })

  it('passes through a string that is not 32 hex chars', () => {
    const input = 'short-id'
    expect(cleanId(input)).toBe(input)
  })

  it('passes through an empty string', () => {
    expect(cleanId('')).toBe('')
  })

  it('passes through a UUID with correct dashes already', () => {
    const input = 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6'
    expect(cleanId(input)).toBe(input)
  })
})

// ── notifyUser() ────────────────────────────────────────────────────────────
describe('notifyUser()', () => {
  const pageId = 'a1b2c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6'
  const message = 'Your dashboard is ready!'

  it('omits mention block when userId is "vizion"', async () => {
    await notifyUser(pageId, 'vizion', message)

    expect(mockClient.comments.create).toHaveBeenCalledWith({
      parent: { page_id: pageId },
      rich_text: [{ type: 'text', text: { content: message } }],
    })
  })

  it('includes mention block when userId is not "vizion"', async () => {
    const userId = 'user-abc-123'
    await notifyUser(pageId, userId, message)

    expect(mockClient.comments.create).toHaveBeenCalledWith({
      parent: { page_id: pageId },
      rich_text: [
        { type: 'mention', mention: { type: 'user', user: { id: userId } } },
        { type: 'text', text: { content: ' ' } },
        { type: 'text', text: { content: message } },
      ],
    })
  })

  it('cleans the pageId via cleanId', async () => {
    const dirtyId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    await notifyUser(dirtyId, 'some-user', 'hi')
    const callArg = mockClient.comments.create.mock.calls[0][0]
    expect(callArg.parent.page_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// ── retrieveDatabaseSchema() ────────────────────────────────────────────────
describe('retrieveDatabaseSchema()', () => {
  const databaseId = 'db-abc-123'

  it('returns database_id, name, and columns with options for select/multi_select/status', async () => {
    mockClient.databases.retrieve.mockResolvedValue({
      id: databaseId,
      title: [{ type: 'text', plain_text: 'My Database' }],
      properties: {
        'Status': {
          type: 'status',
          status: { options: [{ name: 'Not started' }, { name: 'Done' }] },
        },
        'Category': {
          type: 'select',
          select: { options: [{ name: 'A' }, { name: 'B' }] },
        },
        'Tags': {
          type: 'multi_select',
          multi_select: { options: [{ name: 'tag1' }, { name: 'tag2' }] },
        },
        'Name': {
          type: 'title',
          title: {},
        },
        'Price': {
          type: 'number',
          number: {},
        },
      },
    })

    const result = await retrieveDatabaseSchema(databaseId)

    expect(result.database_id).toBe(databaseId)
    expect(result.name).toBe('My Database')
    expect(result.columns).toEqual({
      'Status': { type: 'status', options: ['Not started', 'Done'] },
      'Category': { type: 'select', options: ['A', 'B'] },
      'Tags': { type: 'multi_select', options: ['tag1', 'tag2'] },
      'Name': { type: 'title', options: undefined },
      'Price': { type: 'number', options: undefined },
    })
  })

  it('defaults name to "Untitled" when no title is present', async () => {
    mockClient.databases.retrieve.mockResolvedValue({
      id: databaseId,
      title: [],
      properties: {},
    })

    const result = await retrieveDatabaseSchema(databaseId)
    expect(result.name).toBe('Untitled')
  })

  it('passes databaseId through cleanId', async () => {
    const dirtyId = 'a1b2-c3d4-e5f6-a7b8-c9d0-e1f2a3b4c5d6'
    mockClient.databases.retrieve.mockResolvedValue({
      id: dirtyId,
      title: [],
      properties: {},
    })

    await retrieveDatabaseSchema(dirtyId)
    const callArg = mockClient.databases.retrieve.mock.calls[0][0]
    expect(callArg.database_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// ── queryDatabase() ─────────────────────────────────────────────────────────
describe('queryDatabase()', () => {
  const databaseId = 'db-xyz'

  it('calls databases.query with page_size capped at 100', async () => {
    mockClient.databases.query.mockResolvedValue({ results: [] })

    await queryDatabase(databaseId, 999)

    expect(mockClient.databases.query).toHaveBeenCalledWith({
      database_id: databaseId,
      page_size: 100,
    })
  })

  it('uses the provided page_size when under 100', async () => {
    mockClient.databases.query.mockResolvedValue({ results: [] })

    await queryDatabase(databaseId, 50)

    expect(mockClient.databases.query).toHaveBeenCalledWith({
      database_id: databaseId,
      page_size: 50,
    })
  })

  it('uses default page_size of 30 when not specified', async () => {
    mockClient.databases.query.mockResolvedValue({ results: [] })

    await queryDatabase(databaseId)

    expect(mockClient.databases.query).toHaveBeenCalledWith({
      database_id: databaseId,
      page_size: 30,
    })
  })

  it('calls normalizeRows on results and returns total count', async () => {
    const fakePages = [
      { id: 'p1', properties: { Name: 'Item 1' } },
      { id: 'p2', properties: { Name: 'Item 2' } },
    ]
    mockClient.databases.query.mockResolvedValue({ results: fakePages })

    const result = await queryDatabase(databaseId, 10)

    expect(normalizeRows).toHaveBeenCalledWith(fakePages)
    expect(result).toEqual({
      rows: [
        { id: 'p1', Name: 'Item 1' },
        { id: 'p2', Name: 'Item 2' },
      ],
      total: 2,
    })
  })

  it('passes databaseId through cleanId', async () => {
    const dirtyId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    mockClient.databases.query.mockResolvedValue({ results: [] })

    await queryDatabase(dirtyId)
    const callArg = mockClient.databases.query.mock.calls[0][0]
    expect(callArg.database_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// ── updateDatabaseRow() ─────────────────────────────────────────────────────
describe('updateDatabaseRow()', () => {
  const databaseId = 'db-upd'
  const pageId = 'page-abc-123'
  const properties = { Name: 'Updated', Price: 100 }

  beforeEach(() => {
    mockClient.databases.retrieve.mockResolvedValue({
      id: databaseId,
      properties: {
        Name: { type: 'title', id: 'title' },
        Price: { type: 'number', id: 'number' },
      },
    })
  })

  it('fetches the schema, denormalizes, removes undefined, and calls pages.update', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({
      Name: { title: [{ text: { content: 'Updated' } }] },
      Price: { number: 100 },
    })

    await updateDatabaseRow(databaseId, pageId, properties)

    expect(mockClient.databases.retrieve).toHaveBeenCalledWith({
      database_id: databaseId,
    })
    expect(denormalizeProperties).toHaveBeenCalledWith(properties, {
      Name: { type: 'title' },
      Price: { type: 'number' },
    })
    expect(mockClient.pages.update).toHaveBeenCalledWith({
      page_id: pageId,
      properties: {
        Name: { title: [{ text: { content: 'Updated' } }] },
        Price: { number: 100 },
      },
    })
  })

  it('deletes undefined entries before calling pages.update', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({
      Name: { title: [{ text: { content: 'Updated' } }] },
      Price: undefined,
    })

    await updateDatabaseRow(databaseId, pageId, properties)

    const updateArg = mockClient.pages.update.mock.calls[0][0]
    expect(updateArg.properties).not.toHaveProperty('Price')
    expect(updateArg.properties.Name).toBeDefined()
  })

  it('cleans the pageId', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({})

    const dirtyPageId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    await updateDatabaseRow(databaseId, dirtyPageId, properties)

    const callArg = mockClient.pages.update.mock.calls[0][0]
    expect(callArg.page_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// ── createDatabaseRow() ─────────────────────────────────────────────────────
describe('createDatabaseRow()', () => {
  const databaseId = 'db-create'
  const properties = { Name: 'New Row', Email: 'test@example.com' }

  beforeEach(() => {
    mockClient.databases.retrieve.mockResolvedValue({
      id: databaseId,
      properties: {
        Name: { type: 'title' },
        Email: { type: 'email' },
      },
    })
    mockClient.pages.create.mockResolvedValue({ id: 'new-page-123' })
  })

  it('fetches schema, denormalizes, cleans undefined, calls pages.create, and returns {id}', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({
      Name: { title: [{ text: { content: 'New Row' } }] },
      Email: { email: 'test@example.com' },
    })

    const result = await createDatabaseRow(databaseId, properties)

    expect(mockClient.databases.retrieve).toHaveBeenCalledWith({
      database_id: databaseId,
    })
    expect(denormalizeProperties).toHaveBeenCalledWith(properties, {
      Name: { type: 'title' },
      Email: { type: 'email' },
    })
    expect(mockClient.pages.create).toHaveBeenCalledWith({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: 'New Row' } }] },
        Email: { email: 'test@example.com' },
      },
    })
    expect(result).toEqual({ id: 'new-page-123' })
  })

  it('deletes undefined entries before calling pages.create', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({
      Name: { title: [{ text: { content: 'New Row' } }] },
      Email: undefined,
    })

    await createDatabaseRow(databaseId, properties)

    const createArg = mockClient.pages.create.mock.calls[0][0]
    expect(createArg.properties).not.toHaveProperty('Email')
    expect(createArg.properties.Name).toBeDefined()
  })

  it('cleans the databaseId', async () => {
    vi.mocked(denormalizeProperties).mockReturnValueOnce({})

    const dirtyId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    await createDatabaseRow(dirtyId, properties)

    const retrieveArg = mockClient.databases.retrieve.mock.calls[0][0]
    expect(retrieveArg.database_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})

// ── createNotionDatabase() ──────────────────────────────────────────────────
describe('createNotionDatabase()', () => {
  const pageId = 'page-parent-123'

  it('creates a database with mapped properties and returns {databaseId, columns}', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'new-db-abc' })

    const columns = [
      { name: 'Name', type: 'title' },
      { name: 'Description', type: 'rich_text' },
      { name: 'Price', type: 'number' },
      { name: 'Category', type: 'select', options: ['A', 'B'] },
      { name: 'Tags', type: 'multi_select' },
      { name: 'Status', type: 'status' },
      { name: 'Email', type: 'email' },
      { name: 'URL', type: 'url' },
      { name: 'Phone', type: 'phone_number' },
      { name: 'Active', type: 'checkbox' },
      { name: 'Due', type: 'date' },
    ]

    const result = await createNotionDatabase(pageId, 'My New DB', columns)

    expect(mockClient.databases.create).toHaveBeenCalledWith({
      parent: { page_id: pageId },
      title: [{ type: 'text', text: { content: 'My New DB' } }],
      properties: {
        Name: { title: {} },
        Description: { rich_text: {} },
        Price: { number: { format: 'number' } },
        Category: { select: { options: [{ name: 'A' }, { name: 'B' }] } },
        Tags: { multi_select: { options: [] } },
        Status: {
          status: {
            options: [
              { name: 'Not started' },
              { name: 'In progress' },
              { name: 'Done' },
            ],
          },
        },
        Email: { email: {} },
        URL: { url: {} },
        Phone: { phone_number: {} },
        Active: { checkbox: {} },
        Due: { date: {} },
      },
    })
    expect(result).toEqual({
      databaseId: 'new-db-abc',
      columns: columns.map((c) => ({ name: c.name, type: c.type })),
    })
  })

  it('auto-adds a title property when none of the columns are title type', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-1' })

    const columns = [
      { name: 'Price', type: 'number' },
      { name: 'Name', type: 'rich_text' },
    ]

    await createNotionDatabase(pageId, 'No Title', columns)

    const createArg = mockClient.databases.create.mock.calls[0][0]
    // First column (Price) gets auto-assigned title
    expect(createArg.properties.Price).toEqual({ title: {} })
  })

  it('does NOT auto-add title when a title column already exists', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-2' })

    const columns = [
      { name: 'Title', type: 'title' },
      { name: 'Description', type: 'rich_text' },
    ]

    await createNotionDatabase(pageId, 'Has Title', columns)

    const createArg = mockClient.databases.create.mock.calls[0][0]
    expect(createArg.properties.Title).toEqual({ title: {} })
    // No extra title property should be added
    const titleKeys = Object.entries(createArg.properties).filter(
      ([, v]: [string, any]) => v.title !== undefined,
    )
    expect(titleKeys).toHaveLength(1)
  })

  it('does NOT auto-add title when columns list is empty', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-3' })

    await createNotionDatabase(pageId, 'Empty', [])

    const createArg = mockClient.databases.create.mock.calls[0][0]
    expect(createArg.properties).toEqual({})
  })

  it('skips columns with unknown types', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-4' })

    const columns = [
      { name: 'Name', type: 'title' },
      { name: 'Unknown', type: 'unknown_type' },
    ]

    await createNotionDatabase(pageId, 'Skip Unknown', columns)

    const createArg = mockClient.databases.create.mock.calls[0][0]
    expect(createArg.properties).toEqual({ Name: { title: {} } })
    expect(createArg.properties).not.toHaveProperty('Unknown')
  })

  it('cleans the pageId', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-5' })

    const dirtyId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    await createNotionDatabase(dirtyId, 'Test', [{ name: 'N', type: 'title' }])

    const createArg = mockClient.databases.create.mock.calls[0][0]
    expect(createArg.parent.page_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })

  it('uses default status options when none provided', async () => {
    mockClient.databases.create.mockResolvedValue({ id: 'db-6' })

    // Must include a title column so status column is not overwritten by auto-title
    await createNotionDatabase(pageId, 'Statuses', [
      { name: 'Name', type: 'title' },
      { name: 'Stage', type: 'status' },
    ])

    const createArg = mockClient.databases.create.mock.calls[0][0]
    expect(createArg.properties.Stage).toEqual({
      status: {
        options: [
          { name: 'Not started' },
          { name: 'In progress' },
          { name: 'Done' },
        ],
      },
    })
  })
})

// ── updateEmbed() ───────────────────────────────────────────────────────────
describe('updateEmbed()', () => {
  const pageId = 'page-embed-123'
  const newUrl = 'https://app.spektrum.ai/dashboard/xyz'

  it('finds the embed block and updates its URL', async () => {
    mockClient.blocks.children.list.mockResolvedValue({
      results: [
        { id: 'block-1', type: 'paragraph' },
        { id: 'block-2', type: 'embed', embed: { url: 'https://old.url' } },
        { id: 'block-3', type: 'divider' },
      ],
    })

    await updateEmbed(pageId, newUrl)

    expect(mockClient.blocks.children.list).toHaveBeenCalledWith({
      block_id: pageId,
      page_size: 100,
    })
    expect(mockClient.blocks.update).toHaveBeenCalledWith({
      block_id: 'block-2',
      embed: { url: newUrl },
    })
  })

  it('throws when no embed block exists on the page', async () => {
    mockClient.blocks.children.list.mockResolvedValue({
      results: [
        { id: 'block-1', type: 'paragraph' },
        { id: 'block-3', type: 'divider' },
      ],
    })

    await expect(updateEmbed(pageId, newUrl)).rejects.toThrow(
      'No embed block found on page',
    )
    expect(mockClient.blocks.update).not.toHaveBeenCalled()
  })

  it('throws when blocks list is empty', async () => {
    mockClient.blocks.children.list.mockResolvedValue({ results: [] })

    await expect(updateEmbed(pageId, newUrl)).rejects.toThrow(
      'No embed block found on page',
    )
  })

  it('cleans the pageId', async () => {
    mockClient.blocks.children.list.mockResolvedValue({ results: [] })

    const dirtyId = 'aaaa-bbbb-cccc-dddd-eeee-ffff-1111-2222'
    try {
      await updateEmbed(dirtyId, newUrl)
    } catch {
      // expected to throw
    }

    const callArg = mockClient.blocks.children.list.mock.calls[0][0]
    expect(callArg.block_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    )
  })
})
