import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock @notionhq/client ──────────────────────────────────────────────
const { notionClientStub } = vi.hoisted(() => {
  const makeStub = () => ({
    databases: {
      retrieve: vi.fn(),
      query: vi.fn(),
      create: vi.fn(),
    },
    pages: {
      update: vi.fn(),
      create: vi.fn(),
    },
    comments: {
      create: vi.fn(),
    },
    blocks: {
      children: { list: vi.fn() },
      update: vi.fn(),
    },
  })
  return { notionClientStub: makeStub() }
})

vi.mock('@notionhq/client', () => {
  return {
    Client: class {
      constructor() {
        return notionClientStub
      }
    },
  }
})

// Import after mocks
import {
  cleanId,
  notifyUser,
  retrieveDatabaseSchema,
  queryDatabase,
  updateDatabaseRow,
  createDatabaseRow,
  createNotionDatabase,
  updateEmbed,
} from './api'

beforeEach(() => {
  vi.stubEnv('NOTION_API_KEY', 'test-key')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── cleanId ────────────────────────────────────────────────────────────
describe('cleanId', () => {
  it('reformats a 32-hex string into UUID format', () => {
    const hex = 'abcdefabcdef12345678901234567890'
    const expected = 'abcdefab-cdef-1234-5678-901234567890'
    expect(cleanId(hex)).toBe(expected)
  })

  it('passes through non-32-hex strings unchanged', () => {
    const short = 'abc'
    expect(cleanId(short)).toBe(short)

    const alreadyUuid = 'abc12345-6789-4def-9012-345678901234'
    expect(cleanId(alreadyUuid)).toBe(alreadyUuid)
  })

  it('strips extra dashes that LLMs sometimes introduce', () => {
    const messy = 'ab-cd-ef-12-34-56-78-90-12-34-56-78-90-ab-cd-ef'
    const hex = messy.replace(/-/g, '')
    expect(hex.length).toBe(32)
    const expected = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
    expect(cleanId(messy)).toBe(expected)
  })
})

// ── notifyUser ─────────────────────────────────────────────────────────
describe('notifyUser', () => {
  it('includes @mention when userId is set and not "vizion"', async () => {
    notionClientStub.comments.create.mockResolvedValue({})

    await notifyUser('page-id-123', 'user-456', 'Your dashboard is ready.')

    expect(notionClientStub.comments.create).toHaveBeenCalledWith({
      parent: { page_id: cleanId('page-id-123') },
      rich_text: [
        { type: 'mention', mention: { type: 'user', user: { id: 'user-456' } } },
        { type: 'text', text: { content: ' ' } },
        { type: 'text', text: { content: 'Your dashboard is ready.' } },
      ],
    })
  })

  it('omits mention when userId is "vizion"', async () => {
    notionClientStub.comments.create.mockResolvedValue({})

    await notifyUser('page-id-123', 'vizion', 'Dashboard ready.')

    expect(notionClientStub.comments.create).toHaveBeenCalledWith({
      parent: { page_id: cleanId('page-id-123') },
      rich_text: [{ type: 'text', text: { content: 'Dashboard ready.' } }],
    })
  })

  it('omits mention when userId is empty string', async () => {
    notionClientStub.comments.create.mockResolvedValue({})

    await notifyUser('page-id-123', '', 'Hello.')

    expect(notionClientStub.comments.create).toHaveBeenCalledWith({
      parent: { page_id: cleanId('page-id-123') },
      rich_text: [{ type: 'text', text: { content: 'Hello.' } }],
    })
  })
})

// ── retrieveDatabaseSchema ─────────────────────────────────────────────
describe('retrieveDatabaseSchema', () => {
  it('maps select/multi_select/status options to name strings', async () => {
    notionClientStub.databases.retrieve.mockResolvedValue({
      id: 'db1',
      properties: {
        Status: {
          type: 'select',
          select: { options: [{ name: 'Done' }, { name: 'In Progress' }] },
        },
        Tags: {
          type: 'multi_select',
          multi_select: { options: [{ name: 'Urgent' }, { name: 'Bug' }] },
        },
        Phase: {
          type: 'status',
          status: { options: [{ name: 'Active' }] },
        },
        Name: {
          type: 'title',
          title: {},
        },
      },
      title: [{ plain_text: 'My DB' }],
    })

    const result = await retrieveDatabaseSchema('db1')

    expect(result.database_id).toBe('db1')
    expect(result.name).toBe('My DB')
    expect(result.columns.Status).toEqual({
      type: 'select',
      options: ['Done', 'In Progress'],
    })
    expect(result.columns.Tags).toEqual({
      type: 'multi_select',
      options: ['Urgent', 'Bug'],
    })
    expect(result.columns.Phase).toEqual({
      type: 'status',
      options: ['Active'],
    })
    expect(result.columns.Name).toEqual({
      type: 'title',
      options: undefined,
    })
  })

  it('uses "Untitled" as fallback when title is absent', async () => {
    notionClientStub.databases.retrieve.mockResolvedValue({
      id: 'db2',
      properties: { Name: { type: 'title' } },
    })

    const result = await retrieveDatabaseSchema('db2')
    expect(result.name).toBe('Untitled')
  })
})

// ── queryDatabase ──────────────────────────────────────────────────────
describe('queryDatabase', () => {
  it('caps page_size at 100 and returns { rows, total } with normalized output', async () => {
    notionClientStub.databases.query.mockResolvedValue({
      results: [
        {
          id: 'page1',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Foo' }] },
          },
        },
        {
          id: 'page2',
          properties: {
            Name: { type: 'title', title: [{ plain_text: 'Bar' }] },
          },
        },
      ],
    })

    const result = await queryDatabase('db-id', 999)

    expect(notionClientStub.databases.query).toHaveBeenCalledWith({
      database_id: cleanId('db-id'),
      page_size: 100,
    })
    expect(result.total).toBe(2)
    expect(result.rows).toHaveLength(2)
    expect(result.rows[0].Name).toBe('Foo')
    expect(result.rows[1].Name).toBe('Bar')
  })

  it('passes through a smaller page_size', async () => {
    notionClientStub.databases.query.mockResolvedValue({ results: [] })

    await queryDatabase('db-id', 15)

    expect(notionClientStub.databases.query).toHaveBeenCalledWith({
      database_id: cleanId('db-id'),
      page_size: 15,
    })
  })
})

// ── updateDatabaseRow ──────────────────────────────────────────────────
describe('updateDatabaseRow', () => {
  it('fetches schema, denormalizes, deletes undefined, and calls pages.update with clean IDs', async () => {
    notionClientStub.databases.retrieve.mockResolvedValue({
      id: 'db1',
      properties: {
        Name: { type: 'title' },
        Score: { type: 'number' },
        FormulaField: { type: 'formula' }, // read-only → denormalize returns undefined
      },
    })
    notionClientStub.pages.update.mockResolvedValue({})

    await updateDatabaseRow('db-1', 'page-1', {
      Name: 'Updated',
      Score: 42,
      FormulaField: 'ignored',
    })

    expect(notionClientStub.databases.retrieve).toHaveBeenCalledWith({
      database_id: cleanId('db-1'),
    })
    expect(notionClientStub.pages.update).toHaveBeenCalledWith({
      page_id: cleanId('page-1'),
      properties: {
        Name: { title: [{ text: { content: 'Updated' } }] },
        Score: { number: 42 },
      },
    })
  })
})

// ── createDatabaseRow ──────────────────────────────────────────────────
describe('createDatabaseRow', () => {
  it('fetches schema, denormalizes, deletes undefined, calls pages.create', async () => {
    notionClientStub.databases.retrieve.mockResolvedValue({
      id: 'db1',
      properties: {
        Title: { type: 'title' },
        Status: { type: 'select' },
        RollupField: { type: 'rollup' }, // read-only → undefined
      },
    })
    notionClientStub.pages.create.mockResolvedValue({ id: 'new-page-id' })

    const result = await createDatabaseRow('db-1', {
      Title: 'New Row',
      Status: 'Done',
      RollupField: 'should be skipped',
    })

    expect(result.id).toBe('new-page-id')
    expect(notionClientStub.databases.retrieve).toHaveBeenCalledWith({
      database_id: cleanId('db-1'),
    })
    expect(notionClientStub.pages.create).toHaveBeenCalledWith({
      parent: { database_id: cleanId('db-1') },
      properties: {
        Title: { title: [{ text: { content: 'New Row' } }] },
        Status: { select: { name: 'Done' } },
      },
    })
  })
})

// ── createNotionDatabase ───────────────────────────────────────────────
describe('createNotionDatabase', () => {
  it('ensures a title property when none provided, using first column', async () => {
    notionClientStub.databases.create.mockResolvedValue({ id: 'new-db-id' })

    const result = await createNotionDatabase('page-1', 'My DB', [
      { name: 'Notes', type: 'rich_text' },
      { name: 'Amount', type: 'number' },
    ])

    expect(notionClientStub.databases.create).toHaveBeenCalledWith({
      parent: { page_id: cleanId('page-1') },
      title: [{ type: 'text', text: { content: 'My DB' } }],
      properties: {
        Notes: { title: {} },
        Amount: { number: { format: 'number' } },
      },
    })
    expect(result).toEqual({
      databaseId: 'new-db-id',
      columns: [
        { name: 'Notes', type: 'rich_text' },
        { name: 'Amount', type: 'number' },
      ],
    })
  })

  it('uses title column when present in columns', async () => {
    notionClientStub.databases.create.mockResolvedValue({ id: 'db2' })

    await createNotionDatabase('page-1', 'Sales', [
      { name: 'Product', type: 'title' },
      { name: 'Revenue', type: 'number' },
    ])

    const callArgs = notionClientStub.databases.create.mock.calls[0][0]
    expect(callArgs.properties.Product).toEqual({ title: {} })
    expect(callArgs.properties.Revenue).toEqual({ number: { format: 'number' } })
  })
})

// ── updateEmbed ────────────────────────────────────────────────────────
describe('updateEmbed', () => {
  it('throws "No embed block found on page" when none found', async () => {
    notionClientStub.blocks.children.list.mockResolvedValue({
      results: [
        { id: 'b1', type: 'paragraph' },
        { id: 'b2', type: 'heading_2' },
      ],
    })

    await expect(updateEmbed('page-1', 'https://app.example.com')).rejects.toThrow(
      'No embed block found on page',
    )
  })

  it('calls blocks.update with the new URL on the embed block', async () => {
    const embedBlock = { id: 'embed-1', type: 'embed', embed: { url: 'old' } }
    notionClientStub.blocks.children.list.mockResolvedValue({
      results: [
        { id: 'b1', type: 'paragraph' },
        embedBlock,
      ],
    })
    notionClientStub.blocks.update.mockResolvedValue({})

    await updateEmbed('page-1', 'https://new-app.example.com')

    expect(notionClientStub.blocks.update).toHaveBeenCalledWith({
      block_id: 'embed-1',
      embed: { url: 'https://new-app.example.com' },
    })
  })
})
